import { Injectable, computed, inject, signal } from '@angular/core';
import type { DsIconName } from '@vendedoria/ui';
import type { IntegrationKey } from '../api/billing-api.service';
import { IntegrationState, IntegrationsApiService } from '../api/integrations-api.service';

export type IntegrationInfo = {
  key: IntegrationKey;
  name: string;
  summary: string;
  /** Console page that appears in the sidebar once the integration is on. */
  path: string;
  navLabel: string;
  icon: DsIconName;
  /** Sidebar group where the page appears. */
  group: 'catalog' | 'connect' | 'results' | 'footer';
};

export const INTEGRATIONS: IntegrationInfo[] = [
  {
    key: 'tiktok_live', name: 'TikTok LIVE',
    summary: 'Organiza tus ventas en vivo con ofertas, reservas y pagos. Registra los mensajes y comparte las respuestas manualmente desde el panel; esta conexión no lee ni responde comentarios automáticamente.',
    path: '/app/tiktok-live', navLabel: 'TikTok LIVE', icon: 'radio', group: 'connect',
  },
  {
    key: 'store',
    name: 'Tienda web',
    summary:
      'Tu catálogo en una web propia donde tus clientes compran solos, con pago en línea o pedido por WhatsApp. Tu vendedor IA comparte el enlace de cada producto.',
    path: '/app/store',
    navLabel: 'Tienda web',
    icon: 'store',
    group: 'catalog',
  },
  {
    key: 'instagram',
    name: 'Instagram Direct',
    summary: 'Tu vendedor IA responde los mensajes directos de tu cuenta profesional de Instagram.',
    path: '/app/instagram',
    navLabel: 'Instagram',
    icon: 'instagram',
    group: 'connect',
  },
  {
    key: 'custom_domain',
    name: 'Dominio propio',
    summary: 'Tu tienda en tu propia dirección, por ejemplo www.tumarca.pe, con candado de seguridad incluido.',
    path: '/app/domain',
    navLabel: 'Dominio',
    icon: 'globe',
    group: 'catalog',
  },
  {
    key: 'tracking',
    name: 'Píxel y Analytics',
    summary: 'Conecta el píxel de Meta y Google Analytics para medir visitas, carritos y compras de tu tienda.',
    path: '/app/tracking',
    navLabel: 'Analítica',
    icon: 'chartLine',
    group: 'results',
  },
  {
    key: 'team',
    name: 'Equipo',
    summary: 'Invita a tu equipo para atender mensajes y pedidos, cada uno con su propio acceso.',
    path: '/app/team',
    navLabel: 'Equipo',
    icon: 'users',
    group: 'footer',
  },
];

export function integrationInfo(key: IntegrationKey): IntegrationInfo {
  return INTEGRATIONS.find((item) => item.key === key) ?? INTEGRATIONS[0];
}

/** Integrations of the business, shared by the sidebar and the Integrations page. */
@Injectable({ providedIn: 'root' })
export class IntegrationsStateService {
  private readonly api = inject(IntegrationsApiService);

  readonly states = signal<IntegrationState[]>([]);
  readonly loaded = signal(false);

  /** Working now (on, in the plan, not paused): these show their page in the sidebar. */
  readonly active = computed(
    () => new Set(this.states().filter((state) => state.active).map((state) => state.key)),
  );

  async refresh(): Promise<IntegrationState[]> {
    const states = await this.api.list();
    this.set(states);
    return states;
  }

  set(states: IntegrationState[]): void {
    this.states.set(states);
    this.loaded.set(true);
  }

  isActive(key: IntegrationKey): boolean {
    return this.active().has(key);
  }
}
