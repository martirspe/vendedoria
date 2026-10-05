import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { MoneyPipe } from '../core/money.pipe';
import { OrderPage } from '../features/order/order.page';
import { TemplateDemo } from '../core/template-demo';

/** One payment engine for checkout and existing capability-token order links. */
@Component({
  selector: 'store-checkout-payment',
  imports: [FormsModule, RouterLink, DsIconComponent, MoneyPipe],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent extends OrderPage {
  readonly demo = inject(TemplateDemo);
  readonly sectionNumber = input('');
}
