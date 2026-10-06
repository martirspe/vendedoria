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
      title: 'Prepara tu primer pedido',
      body: 'Configura tu vendedor, agrega un producto con precio y conecta WhatsApp para recibir conversaciones.',
      link: '/app/get-started',
      cta: 'Ir a Empezar',
    },
    {
      title: 'Vendedor IA y pruebas',
      body: 'Personalidad, preguntas frecuentes y límites. Prueba tu vendedor sin afectar tus métricas.',
      link: '/app/seller',
      cta: 'Configurar vendedor',
    },
    {
      title: 'WhatsApp y ventana 24h',
      body: 'Conecta tu número con Meta, revisa el estado del canal y usa plantillas cuando pasen más de 24 horas.',
      link: '/app/channels',
      cta: 'Ir a Canales',
    },
    {
      title: 'Pedido y pago en el chat',
      body: 'Crea el pedido desde Mensajes, envía el link de pago al comprador y sigue su estado en Pedidos.',
      link: '/app/messages',
      cta: 'Abrir Mensajes',
    },
    {
      title: 'Plan y límites',
      body: 'Tu plan en VendedorIA es independiente de los cobros a tus compradores. Sube de plan antes de llegar al límite.',
      link: '/app/plans',
      cta: 'Ver planes',
    },
    {
      title: 'Términos, privacidad y reclamos',
      body: 'Condiciones del servicio, reembolsos, tratamiento de los datos de tus compradores y Libro de Reclamaciones.',
      link: '/legal',
      cta: 'Ir al Centro legal',
    },
  ];
}
