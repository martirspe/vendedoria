import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../core/money.pipe';
import { OrderPage } from '../../features/order/order.page';
import { SelectaCatalog } from './selecta-catalog';
import { SelectaIcon, SelectaIconName } from './selecta-icon';
import { SelectaProductImage } from './selecta-photo';

/** Same payment flow as the classic order page, with the Selecta layout. */
@Component({
  selector: 'selecta-order',
  imports: [FormsModule, RouterLink, MoneyPipe, SelectaIcon, SelectaProductImage],
  templateUrl: './order.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaOrderPage extends OrderPage {
  private readonly catalog = inject(SelectaCatalog);

  readonly ended = computed(
    () => this.order()?.status === 'CANCELLED' || (this.pending() && !this.processing() && !this.canPay()),
  );
  private readonly cancelledByChoice = computed(() => {
    const order = this.order();
    return order?.status === 'CANCELLED' && order.cancelReason !== 'Reserva vencida' && order.paymentState !== 'paid_late';
  });
  readonly statusIcon = computed<SelectaIconName>(() => (this.paid() ? 'success' : this.ended() ? 'alert' : 'shield'));
  readonly title = computed(() => {
    if (this.paid()) return this.order()?.status === 'COMPLETED' ? 'Tu pedido fue entregado.' : 'Tu ritual ya está en camino.';
    if (this.cancelledByChoice()) return 'Tu pedido fue cancelado.';
    if (this.ended()) return 'La reserva terminó.';
    return 'Estamos verificando tu pago.';
  });
  readonly message = computed(() => {
    if (this.paid()) return 'Gracias por elegirnos. Prepararemos tu pedido y te avisaremos por correo cada avance de la entrega.';
    if (this.cancelledByChoice()) return 'No se realizó ningún cobro. Puedes volver a comprar cuando quieras.';
    if (this.ended()) return 'Actualiza tu compra para consultar la disponibilidad actual.';
    return 'Conserva tu número de pedido. Evita enviar un segundo pago mientras lo verificamos.';
  });

  product(handle: string | null) {
    return this.catalog.find(handle);
  }
}
