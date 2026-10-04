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
  readonly refunded = computed(() => this.order()?.paymentState === 'refunded');
  private readonly rejected = computed(() => this.order()?.paymentState === 'rejected');
  readonly statusIcon = computed<SelectaIconName>(() =>
    this.paid() && !this.refunded() ? 'success' : this.ended() || this.refunded() ? 'alert' : 'shield',
  );
  readonly title = computed(() => {
    if (this.refunded()) return 'Tu pago fue actualizado.';
    if (this.paid()) {
      const order = this.order()!;
      if (order.status === 'COMPLETED') return 'Tu pedido se completó.';
      if (order.status === 'SHIPPED') return order.delivery?.mode === 'PICKUP' ? 'Tu pedido está listo para recoger.' : 'Tu pedido está en camino.';
      if (order.status === 'FULFILLING') return order.delivery ? 'Estamos preparando tu pedido.' : 'Estamos coordinando tu pedido.';
      return '¡Gracias, tu pago fue aprobado!';
    }
    if (this.cancelledByChoice()) return 'Tu pedido fue cancelado.';
    if (this.ended() && this.rejected()) return 'El pago no fue aprobado.';
    if (this.ended()) return 'La reserva terminó.';
    return 'Estamos verificando tu pago.';
  });
  readonly message = computed(() => {
    if (this.refunded()) return 'Mercado Pago registró una devolución o un contracargo de este pago. La tienda te contactará por correo con el detalle.';
    if (this.paid()) return this.hasDigital() && !this.order()?.delivery && !this.hasServices()
      ? 'Tu compra está confirmada. Revisa tu acceso digital y guarda este enlace para volver a tu pedido.'
      : 'Tu compra está confirmada. Guarda este enlace para consultar el estado de tu pedido y revisa las indicaciones de entrega o coordinación.';
    if (this.cancelledByChoice()) return 'Este pedido fue cancelado. Puedes volver a comprar cuando quieras.';
    if (this.ended() && this.rejected()) return 'Vuelve a tu carrito para intentarlo con otro medio de pago.';
    if (this.ended()) return 'Actualiza tu compra para consultar la disponibilidad actual.';
    return 'Conserva tu número de pedido. Evita enviar un segundo pago mientras lo verificamos.';
  });

  product(handle: string | null) {
    return this.catalog.find(handle);
  }
}
