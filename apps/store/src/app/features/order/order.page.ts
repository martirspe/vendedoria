import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { PayOrderRequest, PublicOrder } from '@vendedoria/contracts';
import { DsIconComponent } from '@vendedoria/ui';
import { AnalyticsService } from '../../core/analytics.service';
import { CartService } from '../../core/cart.service';
import {
  CardBrickController,
  CardFormData,
  MercadoPagoInstance,
  loadMercadoPago,
} from '../../core/mercadopago-sdk';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreApiService } from '../../core/store-api.service';
import { StoreStateService } from '../../core/store-state.service';

type PayMethod = 'card' | 'yape';

const POLL_MS = 3_000;
const POLL_LIMIT = 40;
const BRICK_ID = 'mp-card-brick';

const REJECTION_MESSAGES: Record<string, string> = {
  insufficient_amount: 'La tarjeta no tiene fondos suficientes.',
  bad_filled_card_data: 'Revisa los datos de la tarjeta.',
  invalid_security_code: 'El código de seguridad no es correcto.',
  invalid_expiration_date: 'La fecha de vencimiento no es correcta.',
  card_disabled: 'La tarjeta está deshabilitada. Llama a tu banco para activarla.',
  max_attempts_exceeded: 'Superaste el número de intentos. Usa otro medio de pago.',
  high_risk: 'El pago fue rechazado por seguridad. Usa otro medio de pago.',
  rejected_by_issuer: 'Tu banco rechazó el pago. Usa otra tarjeta o Yape.',
  rejected_by_bank: 'Tu banco rechazó el pago. Usa otra tarjeta o Yape.',
};

@Component({
  selector: 'store-order-page',
  imports: [FormsModule, RouterLink, DsIconComponent, MoneyPipe],
  templateUrl: './order.page.html',
  styleUrl: './order.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPage {
  /** Checkout embeds the same payment engine; receipt links keep using the route. */
  readonly reserve = input<(() => Promise<PublicOrder | null>) | null>(null);
  readonly amountCents = input(0);
  readonly payerEmail = input('');
  readonly reservationReleased = output<void>();
  readonly inline = computed(() => typeof this.reserve() === 'function');
  readonly payableTotal = computed(() => this.order()?.totalCents ?? this.amountCents());
  private readonly router = inject(Router);
  private readonly api = inject(StoreApiService);
  private readonly cart = inject(CartService);
  private readonly analytics = inject(AnalyticsService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(StoreStateService).store;

  private get id(): string { return this.order()?.id ?? this.route.snapshot.paramMap.get('id') ?? ''; }
  private get token(): string { return this.order()?.token ?? this.route.snapshot.queryParamMap.get('t') ?? ''; }

  readonly order = signal<PublicOrder | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly method = signal<PayMethod>('card');
  readonly sdkError = signal(false);
  readonly sdkLoading = signal(false);
  readonly now = signal(Date.now());
  yapePhone = '';
  yapeOtp = '';

  private mp: MercadoPagoInstance | null = null;
  private brick: CardBrickController | null = null;
  private brickRevision = 0;
  private destroyed = false;
  private mountingBrick = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polls = 0;

  readonly checkout = computed(() => this.store()?.checkout ?? null);
  readonly pending = computed(() => this.order()?.status === 'PENDING_PAYMENT');
  readonly processing = computed(() => this.pending() && ['processing', 'review'].includes(this.order()?.paymentState ?? ''));
  readonly canPay = computed(() =>
    this.order() ? this.pending() && !this.processing() && this.secondsLeft() > 0 : this.inline() && this.amountCents() > 0,
  );
  readonly paid = computed(() => ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'].includes(this.order()?.status ?? ''));
  readonly hasDigital = computed(() => this.order()?.kinds.includes('DIGITAL') ?? false);
  /** Orders whose products were deleted have no kinds: without delivery they were services. */
  readonly hasServices = computed(() => {
    const order = this.order();
    if (!order) return false;
    return order.kinds.includes('SERVICE') || (!order.delivery && !order.kinds.length);
  });
  /** Fulfillment step in buyer words; pickup orders reuse SHIPPED as "ready to pick up". */
  readonly logistics = computed(() => {
    const order = this.order();
    if (!order) return null;
    const pickup = order.delivery?.mode === 'PICKUP';
    const servicesOnly = !order.delivery && !this.hasDigital();
    switch (order.status) {
      case 'FULFILLING':
        return servicesOnly ? 'Estamos coordinando tu servicio.' : 'Estamos preparando tu pedido.';
      case 'SHIPPED':
        return pickup ? 'Tu pedido está listo para recoger.' : 'Tu pedido está en camino.';
      case 'COMPLETED':
        return servicesOnly ? 'Servicio realizado.' : 'Pedido entregado.';
      default:
        return null;
    }
  });
  readonly secondsLeft = computed(() => {
    const expires = this.order()?.expiresAt;
    return expires ? Math.max(Math.floor((Date.parse(expires) - this.now()) / 1000), 0) : 0;
  });
  readonly countdown = computed(() => {
    const s = this.secondsLeft();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  readonly rejection = computed(() => {
    const order = this.order();
    if (!order || order.paymentState !== 'rejected') return null;
    const detail = order.paymentDetail ?? '';
    return REJECTION_MESSAGES[detail] ?? (detail.includes(' ') ? detail : 'El pago fue rechazado. Revisa los datos o usa otro medio de pago.');
  });

  constructor() {
    inject(SeoService).set({ title: 'Tu pedido', path: `/pedido/${this.id}`, noindex: true });
    let clock: ReturnType<typeof setInterval> | null = null;
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (clock) clearInterval(clock);
      this.stopPolling();
      this.unmountBrick();
    });
    effect(() => {
      if (!this.inline() && this.paid() && this.cart.ready() && this.cart.lines().length) {
        untracked(() => this.cart.clear());
      }
    });
    effect(() => {
      const amount = this.payableTotal();
      if (this.inline() && amount > 0) untracked(() => this.remountBrick());
    });
    effect(() => {
      const order = this.order();
      if (this.inline() && this.paid() && order) {
        sessionStorage.removeItem('vendedoria-checkout-key');
        untracked(() => void this.router.navigate(['/pedido', order.id], { queryParams: { t: order.token } }));
      }
    });
    afterNextRender(() => {
      if (this.inline()) this.injector.get(SeoService).set({ title: 'Finaliza tu compra', path: '/checkout', noindex: true });
      let expiryChecked = false;
      clock = setInterval(() => {
        this.now.set(Date.now());
        if (!expiryChecked && this.pending() && !this.processing() && this.order()?.expiresAt && this.secondsLeft() === 0) {
          expiryChecked = true;
          this.unmountBrick();
          void this.refresh();
        }
      }, 1000);
      void this.load();
    });
  }

  async selectMethod(method: PayMethod): Promise<void> {
    if (this.method() === method) return;
    this.method.set(method);
    this.errorMessage.set(null);
    if (method === 'card') this.mountBrickAfterRender();
    else this.unmountBrick();
  }

  async simulate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (this.inline() && !(await this.ensureOrder(this.payableTotal()))) return;
      await this.run(() => this.api.simulate(this.id, this.token));
    } finally { this.busy.set(false); }
  }

  async payWithYape(): Promise<void> {
    if (this.busy() || !this.canPay()) return;
    if (!/^9\d{8}$/.test(this.yapePhone) || !/^\d{6}$/.test(this.yapeOtp)) {
      this.errorMessage.set('Escribe tu celular de Yape (9 dígitos) y el código de aprobación (6 dígitos).');
      return;
    }
    if (!this.mp) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      if (this.inline() && !(await this.ensureOrder(this.payableTotal()))) return;
      const { id } = await this.mp.yape({ otp: this.yapeOtp, phoneNumber: this.yapePhone }).create();
      await this.pay({ method: 'yape', cardToken: id, phone: this.yapePhone });
      this.yapeOtp = '';
    } catch {
      this.errorMessage.set('No pudimos validar tu código de Yape. Genera uno nuevo e inténtalo otra vez.');
    } finally {
      this.busy.set(false);
    }
  }

  async cancel(): Promise<void> {
    await this.run(() => this.api.cancel(this.id, this.token));
  }

  /** Manual check while a payment is in review, beyond the automatic polling. */
  async checkStatus(): Promise<void> {
    this.busy.set(true);
    try {
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.inline()) {
      this.loading.set(false);
      await this.retrySdk();
      return;
    }
    if (!this.id || !this.token) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    try {
      const order = await this.api.order(this.id, this.token);
      if (!order) this.notFound.set(true);
      else this.apply(order);
    } catch {
      this.errorMessage.set('No pudimos cargar tu pedido. Recarga la página.');
    } finally {
      this.loading.set(false);
    }
    const checkout = this.checkout();
    if (this.canPay() && checkout?.publicKey && !checkout.simulator) {
      try {
        const MercadoPago = await loadMercadoPago();
        this.mp = new MercadoPago(checkout.publicKey, { locale: 'es-PE' });
        this.mountBrickAfterRender();
      } catch {
        this.sdkError.set(true);
      }
    }
  }

  async editCheckout(): Promise<void> {
    if (this.busy() || this.processing() || !this.order()) return;
    await this.cancel();
    if (this.order()?.status !== 'CANCELLED') return;
    this.unmountBrick();
    this.order.set(null);
    this.errorMessage.set(null);
    sessionStorage.removeItem('vendedoria-checkout-key');
    this.reservationReleased.emit();
    this.mountBrickAfterRender();
  }

  async retrySdk(): Promise<void> {
    const checkout = this.checkout();
    if (!checkout?.publicKey || checkout.simulator || this.sdkLoading()) return;
    this.sdkError.set(false);
    this.sdkLoading.set(true);
    try {
      const MercadoPago = await loadMercadoPago();
      this.mp = new MercadoPago(checkout.publicKey, { locale: 'es-PE' });
      this.mountBrickAfterRender();
    } catch {
      this.sdkError.set(true);
    } finally {
      this.sdkLoading.set(false);
    }
  }

  private async ensureOrder(expectedCents: number): Promise<boolean> {
    if (!this.order()) {
      const order = await this.reserve()?.();
      if (!order) return false;
      this.apply(order);
    }
    if (this.order()!.totalCents !== expectedCents) {
      this.errorMessage.set('El total de tu pedido se actualizó. Revisa el nuevo importe y vuelve a pulsar Pagar.');
      this.remountBrick();
      return false;
    }
    return this.canPay();
  }

  private apply(order: PublicOrder): void {
    this.order.set(order);
    if (this.paid()) this.analytics.purchase(order);
    if (!this.canPay()) this.unmountBrick();
    else if (this.method() === 'card') this.mountBrickAfterRender();
    if (this.processing()) this.schedulePoll();
    else this.stopPolling();
  }

  private async onCardSubmit(data: CardFormData, extra?: { paymentTypeId?: string }, expectedCents = this.payableTotal()): Promise<void> {
    if (this.busy() || !this.canPay()) return;
    this.busy.set(true);
    try {
      if (this.inline() && !(await this.ensureOrder(expectedCents))) return;
      const identification = data.payer?.identification;
      const type = identification?.type === 'DNI' || identification?.type === 'CE' ? identification.type : null;
      await this.pay({
        method: 'card',
        cardToken: data.token,
        paymentMethodId: data.payment_method_id,
        paymentType: extra?.paymentTypeId ?? 'credit_card',
        ...(type && identification?.number
          ? { identificationType: type, identificationNumber: identification.number }
          : {}),
      });
      if (this.canPay()) this.remountBrick();
    } finally {
      this.busy.set(false);
    }
  }

  private async pay(body: Omit<PayOrderRequest, 'token' | 'paymentKey'>): Promise<void> {
    this.errorMessage.set(null);
    try {
      this.apply(
        await this.api.pay(this.id, { ...body, token: this.token, paymentKey: crypto.randomUUID() }),
      );
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos procesar el pago. Inténtalo de nuevo.'));
      await this.refresh();
    }
  }

  private async run(action: () => Promise<PublicOrder>): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      this.apply(await action());
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos completar la acción. Inténtalo de nuevo.'));
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      const order = await this.api.order(this.id, this.token);
      if (order) this.apply(order);
    } catch {
      // Keep the last known state; polling or a reload will recover it.
    }
  }

  private schedulePoll(): void {
    if (this.pollTimer || this.polls >= POLL_LIMIT) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      this.polls++;
      await this.refresh();
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.polls = 0;
  }

  private mountBrickAfterRender(): void {
    afterNextRender(() => void this.mountBrick(), { injector: this.injector });
  }

  private async mountBrick(): Promise<void> {
    const order = this.order();
    if (this.destroyed || this.mountingBrick || !this.mp || (!order && !this.inline()) || this.brick || this.method() !== 'card' || !this.canPay()) return;
    if (!document.getElementById(BRICK_ID)) return;
    const revision = ++this.brickRevision;
    const amount = this.payableTotal();
    this.mountingBrick = true;
    try {
      const brick = await this.mp.bricks().create('cardPayment', BRICK_ID, {
        initialization: { amount: amount / 100, payer: { email: order?.customer.email ?? this.payerEmail() } },
        customization: {
          paymentMethods: { maxInstallments: 1 },
          visual: { style: { theme: 'default' } },
        },
        callbacks: {
          onReady: () => undefined,
          onSubmit: (data, extra) => this.onCardSubmit(data, extra, amount),
          onError: () => { if (revision === this.brickRevision && !this.destroyed) this.sdkError.set(true); },
        },
      });
      if (revision !== this.brickRevision || this.destroyed) brick.unmount();
      else this.brick = brick;
    } catch {
      if (revision === this.brickRevision && !this.destroyed) this.sdkError.set(true);
    } finally {
      this.mountingBrick = false;
      if (revision !== this.brickRevision && !this.destroyed) this.mountBrickAfterRender();
    }
  }

  /** Card tokens are single use: a declined attempt needs a fresh form. */
  private remountBrick(): void {
    this.unmountBrick();
    this.mountBrickAfterRender();
  }

  private unmountBrick(): void {
    this.brickRevision++;
    this.brick?.unmount();
    this.brick = null;
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 404, 409, 429].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}
