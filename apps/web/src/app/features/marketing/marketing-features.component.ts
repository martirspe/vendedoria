import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DsIconComponent, DsIconName, DsLinkComponent } from '@vendedoria/ui';

type MarketingItem = { icon: DsIconName; title: string; text: string };
@Component({
  selector: 'app-marketing-features',
  imports: [DsIconComponent, DsLinkComponent],
  templateUrl: './marketing-features.component.html',
  styleUrl: './marketing-features.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingFeaturesComponent {
  readonly features: MarketingItem[] = [
    {
      icon: 'package',
      title: 'Habla con tu catálogo a la mano',
      text: 'Recomienda tus productos y consulta precios, variantes y disponibilidad para responder con información de tu negocio.',
    },
    {
      icon: 'wallet',
      title: 'Acerca la conversación al pago',
      text: 'Arma el pedido y envía el enlace de Mercado Pago. El pago confirmado y el pedido quedan conectados.',
    },
    {
      icon: 'pause',
      title: 'Te da el control cuando lo necesitas',
      text: 'Responde desde la consola y el vendedor se pausa en ese chat. Puedes retomar la automatización cuando quieras.',
    },
    {
      icon: 'users',
      title: 'Organiza la atención de tu equipo',
      text: 'Conversaciones, pedidos e información del cliente en un solo lugar, con permisos para cada persona de tu equipo.',
    },
  ];
  readonly steps: MarketingItem[] = [
    {
      icon: 'plug',
      title: 'Conecta tus canales',
      text: 'Vincula tu WhatsApp Business e Instagram con las cuentas y permisos de tu negocio.',
    },
    {
      icon: 'package',
      title: 'Carga tu catálogo',
      text: 'Agrega tus fotos, precios y stock. También puedes importar tus productos desde un archivo.',
    },
    {
      icon: 'bot',
      title: 'Dale tu estilo',
      text: 'Define cómo habla tu vendedor y prueba sus respuestas antes de activarlo.',
    },
    {
      icon: 'shoppingBag',
      title: 'Empieza a vender',
      text: 'Activa la atención, conecta tus cobros y gestiona los pedidos desde tu consola.',
    },
  ];
}
