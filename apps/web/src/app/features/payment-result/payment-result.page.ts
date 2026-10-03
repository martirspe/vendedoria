import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';

const PAYMENT_RESULT_STATES = ['success', 'pending', 'failure'] as const;
type PaymentResultState = (typeof PAYMENT_RESULT_STATES)[number];

interface PaymentResultCopy {
  icon: 'circleCheck' | 'info' | 'circleAlert';
  title: string;
  lead: string;
}

const COPY: Record<PaymentResultState, PaymentResultCopy> = {
  success: {
    icon: 'circleCheck',
    title: '¡Pago recibido!',
    lead: 'Tu pedido quedó confirmado. Te enviamos la confirmación por el mismo chat donde hiciste tu compra.',
  },
  pending: {
    icon: 'info',
    title: 'Tu pago está en proceso',
    lead: 'Mercado Pago lo está revisando. Te avisaremos por el chat apenas se confirme.',
  },
  failure: {
    icon: 'circleAlert',
    title: 'No se completó el pago',
    lead: 'No se realizó ningún cobro. Puedes abrir de nuevo el link de pago e intentar con otro medio, o escribirnos por el chat.',
  },
};

/**
 * Buyer-facing landing for Mercado Pago back URLs of order payments (flow B).
 * Static per state on purpose: no order data or tenant content comes from the URL.
 */
@Component({
  selector: 'app-payment-result-page',
  standalone: true,
  imports: [DsIconComponent],
  templateUrl: './payment-result.page.html',
  styleUrl: './payment-result.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentResultPage {
  private readonly stateParam = inject(ActivatedRoute).snapshot.paramMap.get('state');

  readonly state: PaymentResultState = PAYMENT_RESULT_STATES.includes(
    this.stateParam as PaymentResultState,
  )
    ? (this.stateParam as PaymentResultState)
    : 'pending';
  readonly copy = COPY[this.state];

  constructor() {
    inject(Title).setTitle(this.copy.title);
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }
}
