import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  BillingApiService,
  PayPlanRequest,
  PlanCheckout,
  PlanPaymentResult,
  PlanPurchase,
} from '../../core/api/billing-api.service';
import {
  CardBrickController,
  CardFormData,
  MercadoPagoInstance,
  loadMercadoPago,
} from '../../core/payments/mercadopago-sdk';

type PayMethod = 'card' | 'yape';

const BRICK_ID = 'plan-card-brick';
const POLL_MS = 3_000;
const POLL_LIMIT = 40;

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

/** Pays a plan or chat pack inside the console: Card Payment Brick or Yape, no redirect. */
@Component({
  selector: 'app-plan-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './plan-checkout.component.html',
  styleUrl: './plan-checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanCheckoutComponent {
  private readonly api = inject(BillingApiService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly checkout = input.required<PlanCheckout>();
  readonly purchase = input.required<PlanPurchase>();
  /** Final result (active or under review); the page shows it and reloads the plan. */
  readonly completed = output<PlanPaymentResult>();
  readonly closed = output<void>();

  readonly brickId = BRICK_ID;
  /** Starts with the checkout input and is replaced after a declined attempt. */
  readonly session = linkedSignal(() => this.checkout());
  readonly method = signal<PayMethod>('card');
  readonly sdkLoading = signal(true);
  readonly sdkError = signal(false);
  readonly busy = signal(false);
  readonly processing = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly yapeForm = inject(FormBuilder).nonNullable.group({
    phone: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  private mp: MercadoPagoInstance | null = null;
  private brick: CardBrickController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polls = 0;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopPolling();
      this.unmountBrick();
    });
    afterNextRender(() => {
      this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      void this.init();
    });
  }

  money(cents: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  }

  selectMethod(method: PayMethod): void {
    if (this.method() === method || this.busy()) return;
    this.method.set(method);
    this.errorMessage.set(null);
    if (method === 'card') this.mountBrickAfterRender();
    else this.unmountBrick();
  }

  close(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  async payWithYape(): Promise<void> {
    if (this.busy() || !this.mp) return;
    if (this.yapeForm.invalid) {
      this.yapeForm.markAllAsTouched();
      this.errorMessage.set('Escribe tu celular de Yape (9 dígitos) y el código de aprobación (6 dígitos).');
      return;
    }
    const { phone, otp } = this.yapeForm.getRawValue();
    this.busy.set(true);
    this.errorMessage.set(null);
    let token: string;
    try {
      token = (await this.mp.yape({ otp, phoneNumber: phone }).create()).id;
    } catch {
      this.busy.set(false);
      this.errorMessage.set('No pudimos validar tu código de Yape. Genera uno nuevo e inténtalo otra vez.');
      return;
    }
    this.yapeForm.controls.otp.reset();
    await this.pay({ method: 'yape', cardToken: token, phone });
    this.busy.set(false);
  }

  private async init(): Promise<void> {
    const publicKey = this.session().publicKey;
    if (!publicKey) {
      this.sdkLoading.set(false);
      this.sdkError.set(true);
      return;
    }
    try {
      const MercadoPago = await loadMercadoPago();
      if (this.destroyed) return;
      this.mp = new MercadoPago(publicKey, { locale: 'es-PE' });
      this.mountBrickAfterRender();
    } catch {
      this.sdkError.set(true);
    } finally {
      this.sdkLoading.set(false);
    }
  }

  private async onCardSubmit(data: CardFormData, extra?: { paymentTypeId?: string }): Promise<void> {
    const identification = data.payer?.identification;
    const type = ['DNI', 'CE', 'RUC'].includes(identification?.type ?? '')
      ? (identification?.type as PayPlanRequest['identificationType'])
      : undefined;
    this.busy.set(true);
    await this.pay({
      method: 'card',
      cardToken: data.token,
      paymentMethodId: data.payment_method_id,
      paymentType: extra?.paymentTypeId ?? 'credit_card',
      ...(data.payer?.email ? { payerEmail: data.payer.email } : {}),
      ...(type && identification?.number
        ? { identificationType: type, identificationNumber: identification.number }
        : {}),
    });
    this.busy.set(false);
  }

  private async pay(body: PayPlanRequest): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.handle(await this.api.payPlan(this.session().paymentId, body));
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos procesar el pago. Inténtalo de nuevo.'));
      await this.renew();
    }
  }

  private async handle(result: PlanPaymentResult): Promise<void> {
    switch (result.status) {
      case 'active':
      case 'review':
        this.stopPolling();
        this.unmountBrick();
        this.completed.emit(result);
        return;
      case 'pending':
        this.processing.set(true);
        this.unmountBrick();
        this.schedulePoll();
        return;
      case 'failed':
        this.processing.set(false);
        this.errorMessage.set(
          REJECTION_MESSAGES[result.detail ?? ''] ??
            'El pago fue rechazado. Revisa los datos o usa otro medio de pago.',
        );
        await this.renew();
        return;
    }
  }

  /** A declined attempt closes its payment: card tokens are single use, so start a fresh one. */
  private async renew(): Promise<void> {
    try {
      this.session.set(await this.api.createCheckout(this.purchase()));
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos preparar un nuevo intento. Cierra y vuelve a elegir tu plan.'));
      return;
    }
    this.unmountBrick();
    if (this.method() === 'card') this.mountBrickAfterRender();
  }

  private schedulePoll(): void {
    if (this.pollTimer || this.destroyed) return;
    if (this.polls >= POLL_LIMIT) {
      this.completed.emit({ status: 'pending' });
      return;
    }
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      this.polls++;
      try {
        const result = await this.api.paymentStatus(this.session().paymentId);
        if (result.status === 'pending') this.schedulePoll();
        else await this.handle(result);
      } catch {
        this.schedulePoll();
      }
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
    const session = this.session();
    if (!this.mp || this.brick || this.method() !== 'card' || this.processing()) return;
    if (!document.getElementById(BRICK_ID)) return;
    try {
      const brick = await this.mp.bricks().create('cardPayment', BRICK_ID, {
        initialization: { amount: session.amountCents / 100, payer: { email: session.payerEmail } },
        customization: {
          paymentMethods: { maxInstallments: 1 },
          visual: { hideFormTitle: true, style: { theme: 'default' } },
        },
        callbacks: {
          onSubmit: (data, extra) => this.onCardSubmit(data, extra),
          onError: () => undefined,
        },
      });
      if (this.destroyed || this.brick) brick.unmount();
      else this.brick = brick;
    } catch {
      this.sdkError.set(true);
    }
  }

  private unmountBrick(): void {
    this.brick?.unmount();
    this.brick = null;
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 404, 409, 503].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}
