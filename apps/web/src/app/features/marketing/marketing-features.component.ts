import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DsIconComponent, DsIconName } from '@vendedoria/ui';

type MarketingItem = { icon: DsIconName; title: string; text: string };

@Component({
  selector: 'app-marketing-features',
  standalone: true,
  imports: [DsIconComponent],
  templateUrl: './marketing-features.component.html',
  styleUrl: './marketing-features.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingFeaturesComponent {
  readonly steps: MarketingItem[] = [
    {
      icon: 'plug',
      title: 'Conecta tus canales',
      text: 'Vincula tu WhatsApp Business y tu Instagram desde la consola, sin instalar nada.',
    },
    {
      icon: 'package',
      title: 'Sube tu catálogo',
      text: 'Carga productos con fotos, precios y stock, uno por uno o desde un archivo.',
    },
    {
      icon: 'bot',
      title: 'Tu vendedor atiende',
      text: 'Responde dudas, recomienda productos de tu catálogo y arma el pedido en el chat.',
    },
    {
      icon: 'wallet',
      title: 'Cobras y despachas',
      text: 'El cliente paga con tarjeta o Yape por Mercado Pago y el pedido aparece en tu consola.',
    },
  ];

  readonly features: MarketingItem[] = [
    {
      icon: 'message',
      title: 'Vendedor IA en tus chats',
      text: 'Atiende WhatsApp e Instagram al instante, a cualquier hora, con el tono de tu marca.',
    },
    {
      icon: 'check',
      title: 'Solo información real',
      text: 'Precio, stock y envío salen de tu catálogo. Si no lo sabe, no lo inventa.',
    },
    {
      icon: 'pause',
      title: 'Tú tomas el control',
      text: 'Cuando respondes un chat, el vendedor se pausa en esa conversación hasta que lo reactives.',
    },
    {
      icon: 'store',
      title: 'Tienda web diseñada con IA',
      text: 'Elige una plantilla, genera textos e imágenes con IA y publica tu tienda en minutos.',
    },
    {
      icon: 'ticket',
      title: 'Cupones y campañas',
      text: 'Descuentos por porcentaje, monto fijo o envío gratis, con vigencia y límite de usos.',
    },
    {
      icon: 'layers',
      title: 'Inventario al día',
      text: 'El stock se descuenta con cada venta, en el chat y en la tienda, sin vender lo que no tienes.',
    },
    {
      icon: 'kanban',
      title: 'Pedidos en un solo lugar',
      text: 'Sigue cada pedido desde el pago hasta la entrega, con el historial del chat a la mano.',
    },
    {
      icon: 'users',
      title: 'Trabaja en equipo',
      text: 'Invita a tu equipo con permisos y atiendan juntos desde la misma bandeja.',
    },
  ];
}
