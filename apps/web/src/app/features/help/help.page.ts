import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';

type HelpTopic = {
  title: string;
  body: string;
  link: string;
  cta: string;
};

@Component({
  selector: 'app-help-page',
  standalone: true,
  imports: [RouterLink, DsIconComponent],
  templateUrl: './help.page.html',
  styleUrl: './help.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpPage {
  readonly topics: HelpTopic[] = [
    {
      title: 'Primer pedido en 30 minutos',
      body: 'Checklist real: vendedor configurado, producto con precio, WhatsApp conectado, prueba en Mensajes.',
      link: '/app/get-started',
      cta: 'Ir a Empezar',
    },
    {
      title: 'Vendedor IA y playground',
      body: 'Personalidad, FAQs y límites. Prueba sin contaminar métricas de producción.',
      link: '/app/seller',
      cta: 'Configurar vendedor',
    },
    {
      title: 'WhatsApp y ventana 24h',
      body: 'Conecta Meta Cloud API, revisa diagnóstico del canal y usa plantillas fuera de ventana.',
      link: '/app/channels',
      cta: 'Ir a Canales',
    },
    {
      title: 'Pedido + pago en el chat',
      body: 'Flujo B: crea pedido desde Mensajes, link de pago al comprador, estado en Pedidos.',
      link: '/app/messages',
      cta: 'Abrir Mensajes',
    },
    {
      title: 'Plan y cuotas (flujo A)',
      body: 'Suscripción del merchant separada del cobro al comprador. Sube plan antes del bloqueo.',
      link: '/app/plans',
      cta: 'Ver planes',
    },
  ];
}
