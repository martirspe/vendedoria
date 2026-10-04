import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import { LEGAL_LINKS, PLATFORM_LEGAL } from '../legal/legal-identity';

type MarketingPlan = {
  name: string;
  price: string;
  description: string;
  highlights: string[];
  featured: boolean;
};

type MarketingQuestion = { question: string; answer: string };

/** Summary of `apps/api/src/billing/plan-catalog.ts` for the prerendered home: keep both in sync. */
const PLANS: MarketingPlan[] = [
  {
    name: 'Inicia',
    price: 'S/ 29',
    description: 'Para empezar a vender por WhatsApp e Instagram con tu vendedor IA.',
    highlights: ['50 chats nuevos al mes', 'Hasta 25 productos', '1 usuario', 'Sin tienda web'],
    featured: false,
  },
  {
    name: 'Crece',
    price: 'S/ 79',
    description: 'Para vender todos los días con tu tienda web, diseñada con IA en minutos.',
    highlights: [
      'Tienda web con cobros con tarjeta y Yape',
      '400 chats nuevos al mes',
      'Hasta 100 productos',
      '5 cupones activos y 2 usuarios',
      'Tu dominio propio',
    ],
    featured: true,
  },
  {
    name: 'Escala',
    price: 'S/ 199',
    description: 'Para negocios que invierten en anuncios y atienden en equipo.',
    highlights: [
      '1 200 chats nuevos al mes',
      'Hasta 300 productos',
      '20 cupones activos y 5 usuarios',
      'Píxel de Meta y Google Analytics',
    ],
    featured: false,
  },
  {
    name: 'Lidera',
    price: 'S/ 549',
    description: 'Para negocios con mucho volumen de chats y un catálogo grande.',
    highlights: [
      '4 000 chats nuevos al mes',
      'Hasta 1 000 productos',
      'Cupones sin límite y 15 usuarios',
      'Soporte prioritario',
    ],
    featured: false,
  },
];

const QUESTIONS: MarketingQuestion[] = [
  {
    question: '¿Necesito saber de tecnología para usarlo?',
    answer:
      'No. Conectas tus canales, cargas tu catálogo y eliges cómo habla tu vendedor desde la consola. Puedes probarlo en un chat de práctica antes de activarlo con clientes reales.',
  },
  {
    question: '¿El vendedor IA puede inventar precios o promociones?',
    answer:
      'No. Responde con los precios, el stock y los envíos que tienes en tu catálogo. Si un dato no está, se lo dice al cliente en lugar de inventarlo.',
  },
  {
    question: '¿Qué pasa si quiero responder yo?',
    answer:
      'Escribe en el chat desde la consola: el vendedor se pausa en esa conversación y tú sigues. Lo reactivas cuando quieras.',
  },
  {
    question: '¿Cómo me pagan mis clientes?',
    answer:
      'Con tarjeta o Yape a través de Mercado Pago, con un link que el vendedor envía en el chat o desde tu tienda web. El dinero llega a tu cuenta de Mercado Pago y VendedorIA no cobra comisión por venta.',
  },
  {
    question: '¿Qué cuenta como un chat nuevo?',
    answer:
      'Una persona que te escribe por primera vez. Si vuelve a escribirte, no cuenta otra vez. Si llegas al límite del mes, puedes sumar chats extra.',
  },
  {
    question: '¿WhatsApp tiene costos aparte?',
    answer:
      'Sí. Meta cobra los mensajes de WhatsApp en tu propia cuenta de WhatsApp Business. Cada número tiene 1 000 respuestas gratis al mes antes de empezar a pagar.',
  },
  {
    question: '¿Cómo funciona la prueba gratis?',
    answer:
      'Tienes 14 días del plan Crece sin tarjeta, con hasta 100 chats nuevos. Al terminar, eliges el plan que mejor te quede; no hay contratos.',
  },
];

@Component({
  selector: 'app-marketing-pricing',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './marketing-pricing.component.html',
  styleUrl: './marketing-pricing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingPricingComponent {
  readonly plans = PLANS;
  readonly questions = QUESTIONS;
  readonly year = new Date().getFullYear();
  readonly legal = PLATFORM_LEGAL;
  readonly links = LEGAL_LINKS;
}
