import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthApiService } from '../core/auth/auth-api.service';
import { BillingApiService, IntegrationKey } from '../core/api/billing-api.service';
import { INTEGRATIONS, IntegrationsStateService } from '../core/integrations/integrations-state.service';
import {
  DsIconComponent,
  DsIconName,
} from '@vendedoria/ui';
import { SELLER_SECTIONS } from '../features/seller/seller-config';
import { environment } from '../../environments/environment';

type ConsoleNavChild = {
  label: string;
  path: string;
};

type ConsoleNavItem = {
  label: string;
  path: string;
  icon: DsIconName;
  children?: ConsoleNavChild[];
  /** Shown only while this integration is active. */
  integration?: IntegrationKey;
};

type ConsoleNavGroup = {
  id: string;
  label: string | null;
  items: ConsoleNavItem[];
};

type PaletteAction = {
  id: string;
  label: string;
  hint: string;
  path: string;
  icon: DsIconName;
  integration?: IntegrationKey;
};

@Component({
  selector: 'app-console-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DsIconComponent],
  templateUrl: './console-shell.layout.html',
  styleUrl: './console-shell.layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsoleShellLayout {
  private readonly auth = inject(AuthApiService);
  private readonly billing = inject(BillingApiService);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly router = inject(Router);

  readonly paletteOpen = signal(false);
  readonly paletteQuery = signal('');
  readonly quotaWarning = signal<string | null>(null);
  /** Early in the trial the banner offers the setup session instead of the plans. */
  readonly quotaAction = signal<'plans' | 'onboarding'>('plans');
  readonly onboardingUrl = environment.onboardingUrl;

  private readonly baseNavGroups: ConsoleNavGroup[] = [
    {
      id: 'start',
      label: null,
      items: [{ label: 'Empezar', path: '/app/get-started', icon: 'rocket' }],
    },
    {
      id: 'sell',
      label: 'Ventas',
      items: [
        {
          label: 'Vendedor IA',
          path: '/app/seller',
          icon: 'bot',
          children: SELLER_SECTIONS.map((section) => ({
            label: section.label,
            path: `/app/seller/${section.id}`,
          })),
        },
        { label: 'Mensajes', path: '/app/messages', icon: 'message' },
        { label: 'Pedidos', path: '/app/orders', icon: 'shoppingBag' },
        { label: 'Envíos', path: '/app/shipping', icon: 'truck' },
      ],
    },
    {
      id: 'catalog',
      label: 'Catálogo',
      items: [
        { label: 'Productos', path: '/app/products', icon: 'package' },
        { label: 'Inventario', path: '/app/inventory', icon: 'list' },
        { label: 'Cupones', path: '/app/coupons', icon: 'ticket', integration: 'store' },
      ],
    },
    {
      id: 'connect',
      label: 'Conexiones',
      items: [
        { label: 'Canales', path: '/app/channels', icon: 'radio' },
        { label: 'Cobros', path: '/app/payments', icon: 'wallet' },
        { label: 'Integraciones', path: '/app/integrations', icon: 'plug' },
      ],
    },
    {
      id: 'results',
      label: 'Resultados',
      items: [{ label: 'Métricas', path: '/app/metrics', icon: 'chartColumn' }],
    },
  ];

  private readonly baseFooterItems: ConsoleNavItem[] = [
    { label: 'Planes', path: '/app/plans', icon: 'creditCard' },
    { label: 'Ajustes', path: '/app/settings', icon: 'settings' },
    { label: 'Ayuda', path: '/app/help', icon: 'circleHelp' },
  ];

  /** Pages of active integrations, placed right after their closest sibling. */
  private readonly activeIntegrations = computed(() =>
    INTEGRATIONS.filter((integration) => this.integrations.isActive(integration.key)),
  );

  readonly navGroups = computed<ConsoleNavGroup[]>(() =>
    this.baseNavGroups.map((group) => ({
      ...group,
      items: [
        ...group.items.filter((item) => !item.integration || this.integrations.isActive(item.integration)),
        ...this.activeIntegrations()
          .filter((integration) => integration.group === group.id)
          .map((integration) => ({ label: integration.navLabel, path: integration.path, icon: integration.icon })),
      ],
    })),
  );

  readonly footerItems = computed<ConsoleNavItem[]>(() => {
    const team = this.activeIntegrations().filter((integration) => integration.group === 'footer');
    const [plans, ...rest] = this.baseFooterItems;
    return [
      plans,
      ...team.map((integration) => ({ label: integration.navLabel, path: integration.path, icon: integration.icon })),
      ...rest,
    ];
  });

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Parents the user collapsed or expanded by hand; others follow the active route. */
  private readonly toggled = signal<Record<string, boolean>>({});

  isInSection(item: ConsoleNavItem): boolean {
    const path = this.currentUrl().split('?')[0];
    return path === item.path || path.startsWith(`${item.path}/`);
  }

  isExpanded(item: ConsoleNavItem): boolean {
    return this.toggled()[item.path] ?? this.isInSection(item);
  }

  toggleItem(item: ConsoleNavItem): void {
    const next = !this.isExpanded(item);
    this.toggled.update((state) => ({ ...state, [item.path]: next }));
  }

  readonly paletteActions: PaletteAction[] = [
    {
      id: 'start',
      label: 'Empezar',
      hint: 'Checklist para vender',
      path: '/app/get-started',
      icon: 'rocket',
    },
    {
      id: 'payments',
      label: 'Conectar Mercado Pago',
      hint: 'Cobros · tarjeta y Yape',
      path: '/app/payments',
      icon: 'wallet',
    },
    {
      id: 'whatsapp',
      label: 'Conectar WhatsApp',
      hint: 'Canales · Meta Cloud API',
      path: '/app/channels',
      icon: 'whatsapp',
    },
    {
      id: 'test-seller',
      label: 'Probar vendedor',
      hint: 'Ensaya sin escribir a clientes reales',
      path: '/app/seller/profile',
      icon: 'bot',
    },
    ...SELLER_SECTIONS.map((section) => ({
      id: `seller-${section.id}`,
      label: section.label,
      hint: `Vendedor IA · ${section.hint}`,
      path: `/app/seller/${section.id}`,
      icon: section.icon,
    })),
    {
      id: 'products',
      label: 'Productos',
      hint: 'Catálogo vendible',
      path: '/app/products',
      icon: 'package',
    },
    {
      id: 'inventory',
      label: 'Inventario',
      hint: 'Stock por SKU',
      path: '/app/inventory',
      icon: 'list',
    },
    {
      id: 'coupons',
      label: 'Cupones',
      hint: 'Descuentos para tu tienda web',
      path: '/app/coupons',
      icon: 'ticket',
      integration: 'store',
    },
    {
      id: 'messages',
      label: 'Mensajes',
      hint: 'Inbox operativo',
      path: '/app/messages',
      icon: 'message',
    },
    {
      id: 'orders',
      label: 'Pedidos',
      hint: 'Pedidos y pagos de compradores',
      path: '/app/orders',
      icon: 'shoppingBag',
    },
    {
      id: 'shipping',
      label: 'Envíos',
      hint: 'Delivery, agencias y recojo',
      path: '/app/shipping',
      icon: 'truck',
    },
    {
      id: 'plans',
      label: 'Planes',
      hint: 'Tu plan y límites',
      path: '/app/plans',
      icon: 'creditCard',
    },
    {
      id: 'help',
      label: 'Ayuda',
      hint: 'Guías in-app',
      path: '/app/help',
      icon: 'circleHelp',
    },
  ];

  readonly filteredPalette = computed(() => {
    const q = this.paletteQuery().trim().toLowerCase();
    const actions: PaletteAction[] = [
      ...this.paletteActions.filter(
        (action) => !action.integration || this.integrations.isActive(action.integration),
      ),
      ...this.activeIntegrations().map((integration) => ({
        id: `integration-${integration.key}`,
        label: integration.name,
        hint: 'Integración activa',
        path: integration.path,
        icon: integration.icon,
      })),
      {
        id: 'integrations',
        label: 'Integraciones',
        hint: 'Tienda web, dominio, Instagram, analítica y equipo',
        path: '/app/integrations',
        icon: 'plug',
      },
    ];
    if (!q) return actions;
    return actions.filter(
      (action) =>
        action.label.toLowerCase().includes(q) ||
        action.hint.toLowerCase().includes(q),
    );
  });

  constructor() {
    void this.loadQuotaWarning();
    void this.integrations.refresh().catch(() => undefined);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.paletteOpen.update((open) => !open);
      if (!this.paletteOpen()) {
        this.paletteQuery.set('');
      }
    }
    if (event.key === 'Escape' && this.paletteOpen()) {
      this.closePalette();
    }
  }

  async loadQuotaWarning(): Promise<void> {
    try {
      const usage = await this.billing.getUsage();
      this.quotaAction.set('plans');
      const daysLeft = usage.planExpiresAt
        ? Math.ceil((new Date(usage.planExpiresAt).getTime() - Date.now()) / 86_400_000)
        : null;
      if (usage.planStatus === 'EXPIRED') {
        this.quotaWarning.set(
          'Tu plan venció: tu vendedor IA no atiende chats nuevos. Renueva tu plan para volver a la normalidad.',
        );
      } else if (usage.planStatus === 'TRIAL' && daysLeft !== null && daysLeft <= 7) {
        this.quotaWarning.set(
          daysLeft <= 1
            ? 'Tu prueba gratis termina hoy. Elige un plan para que tu vendedor IA siga atendiendo chats nuevos.'
            : `Tu prueba gratis termina en ${daysLeft} días. Elige un plan para no detener tus ventas.`,
        );
      } else if (usage.conversationAtLimit) {
        this.quotaWarning.set(
          `Usaste tus ${usage.conversationQuota} chats nuevos de este mes. Tu vendedor IA sigue atendiendo a quienes ya te escribieron.`,
        );
      } else if (usage.aiAtLimit) {
        this.quotaWarning.set(
          'Usaste las respuestas con IA de este mes: tu vendedor sigue atendiendo con respuestas básicas. Suma chats extra o cambia de plan en Planes.',
        );
      } else if (usage.productAtLimit) {
        this.quotaWarning.set(
          `Llegaste al máximo de ${usage.productQuota} productos de tu plan.`,
        );
      } else if (
        usage.conversationQuota &&
        usage.conversationsUsed / usage.conversationQuota >= 0.85
      ) {
        this.quotaWarning.set(
          `Usaste ${usage.conversationsUsed} de tus ${usage.conversationQuota} chats nuevos de este mes.`,
        );
      } else if (usage.planStatus === 'TRIAL' && daysLeft !== null) {
        this.quotaWarning.set(
          `Te quedan ${daysLeft} días de prueba gratis. Te ayudamos a dejar todo listo en una sesión gratis por Zoom.`,
        );
        this.quotaAction.set('onboarding');
      } else {
        this.quotaWarning.set(null);
      }
    } catch {
      this.quotaWarning.set(null);
    }
  }

  openPalette(): void {
    this.paletteOpen.set(true);
    this.paletteQuery.set('');
  }

  closePalette(): void {
    this.paletteOpen.set(false);
    this.paletteQuery.set('');
  }

  onPaletteQuery(value: string): void {
    this.paletteQuery.set(value);
  }

  runPaletteAction(action: PaletteAction): void {
    this.closePalette();
    if (action.id === 'test-seller') {
      void this.router.navigate(['/app/seller/profile'], {
        queryParams: { playground: '1' },
      });
      return;
    }
    void this.router.navigateByUrl(action.path);
  }

  logout(): void {
    this.auth.logout();
    location.href = '/auth/login';
  }
}
