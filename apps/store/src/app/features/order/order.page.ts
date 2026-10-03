import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  private readonly api = inject(StoreApiService);
  private readonly cart = inject(CartService);
  private readonly analytics = inject(AnalyticsService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(StoreStateService).store;

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly token = this.route.snapshot.queryParamMap.get('t') ?? '';

  readonly order = signal<PublicOrder | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly method = signal<PayMethod>('card');
  readonly sdkError = signal(false);
  readonly now = signal(Date.now());
  yapePhone = '';
  yapeOtp = '';

  private mp: MercadoPagoInstance | null = null;
  private brick: CardBrickController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polls = 0;

  readonly checkout = computed(() => this.store()?.checkout ?? null);
  readonly pending = computed(() => this.order()?.status === 'PENDING_PAYMENT');
  readonly processing = computed(() => this.pending() && ['processing', 'review'].includes(this.order()?.paymentState ?? ''));
  readonly canPay = computed(() => this.pending() && !this.processing() && this.secondsLeft() > 0);
  readonly paid = computed(() => ['PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED'].includes(this.order()?.status ?? ''));
  /** Fulfillment step in buyer words; pickup orders reuse SHIPPED as "ready to pick up". */
  readonly logistics = computed(() => {
    const order = this.order();
    if (!order) return null;
    const pickup = order.delivery.mode === 'PICKUP';
    switch (order.status) {
      case 'FULFILLING':
        return 'Estamos preparando tu pedido.';
      case 'SHIPPED':
        return pickup ? 'Tu pedido está listo para recoger.' : 'Tu pedido está en camino.';
      case 'COMPLETED':
        return 'Pedido entregado.';
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
      if (clock) clearInterval(clock);
      this.stopPolling();
      this.brick?.unmount();
    });
    effect(() => {
      if (this.paid() && this.cart.ready() && this.cart.lines().length) {
        untracked(() => this.cart.clear());
      }
    });
    afterNextRender(() => {
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
    await this.run(() => this.api.simulate(this.id, this.token));
  }

  async payWithYape(): Promise<void> {
    if (!/^9\d{8}$/.test(this.yapePhone) || !/^\d{6}$/.test(this.yapeOtp)) {
      this.errorMessage.set('Escribe tu celular de Yape (9 dígitos) y el código de aprobación (6 dígitos).');
      return;
    }
    if (!this.mp) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
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

  private apply(order: PublicOrder): void {
    this.order.set(order);
    if (this.paid()) this.analytics.purchase(order);
    if (!this.canPay()) this.unmountBrick();
    else if (this.method() === 'card') this.mountBrickAfterRender();
    if (this.processing()) this.schedulePoll();
    else this.stopPolling();
  }

  private async onCardSubmit(data: CardFormData, extra?: { paymentTypeId?: string }): Promise<void> {
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
    if (!this.mp || !order || this.brick || this.method() !== 'card' || !this.canPay()) return;
    if (!document.getElementById(BRICK_ID)) return;
    try {
      this.brick = await this.mp.bricks().create('cardPayment', BRICK_ID, {
        initialization: { amount: order.totalCents / 100, payer: { email: order.customer.email } },
        customization: {
          paymentMethods: { maxInstallments: 1 },
          visual: { style: { theme: 'default' } },
        },
        callbacks: {
          onSubmit: (data, extra) => this.onCardSubmit(data, extra),
          onError: () => undefined,
        },
      });
    } catch {
      this.sdkError.set(true);
    }
  }

  /** Card tokens are single use: a declined attempt needs a fresh form. */
  private remountBrick(): void {
    this.unmountBrick();
    this.mountBrickAfterRender();
  }

  private unmountBrick(): void {
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
