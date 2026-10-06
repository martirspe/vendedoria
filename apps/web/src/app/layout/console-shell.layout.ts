import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { filter, map } from 'rxjs';
import { AuthApiService } from '../core/auth/auth-api.service';
import { AccountApiService } from '../core/api/account-api.service';
import { BillingApiService, IntegrationKey } from '../core/api/billing-api.service';
import {
  INTEGRATIONS,
  IntegrationsStateService,
} from '../core/integrations/integrations-state.service';
import { DsIconComponent, DsIconName, DsMenuComponent, DsModalDirective } from '@vendedoria/ui';
import { SELLER_SECTIONS } from '../features/seller/seller-config';
import { initialsOf } from '../features/profile/profile-utils';
import { environment } from '../../environments/environment';
import { CONSOLE_CONTEXTS, contextForUrl, isContextLinkActive, normalizeSearch, type ContextLink } from './console-context';
import { CatalogApiService, type ProductDto } from '../core/api/catalog-api.service';

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
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    DsIconComponent,
    DsModalDirective,
    DsMenuComponent,
  ],
  templateUrl: './console-shell.layout.html',
  host: { class: 'tw:block tw:min-h-dvh' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsoleShellLayout {
  private readonly auth = inject(AuthApiService);
  private readonly account = inject(AccountApiService);
  private readonly billing = inject(BillingApiService);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly router = inject(Router);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly catalog = inject(CatalogApiService);

  readonly paletteOpen = signal(false);
  readonly mobileNavOpen = signal(false);
  readonly navCollapsed = signal(false);
  readonly paletteQuery = signal('');
  readonly contextQuery = signal('');
  readonly paletteFilter = signal<'todos' | 'productos' | 'vendedor' | 'conexiones' | 'ajustes'>('todos');
  readonly paletteFiltersOpen = signal(false);
  readonly paletteIndex = signal(0);
  readonly paletteLoading = signal(false);
  readonly paletteError = signal(false);
  readonly paletteProducts = signal<ProductDto[]>([]);
  readonly paletteRecent = signal<PaletteAction[]>([]);
  readonly searchFilters = [
    { id: 'todos', label: 'Todo' }, { id: 'productos', label: 'Productos' },
    { id: 'vendedor', label: 'Vendedor IA' }, { id: 'conexiones', label: 'Conexiones' },
    { id: 'ajustes', label: 'Ajustes' },
  ] as const;
  readonly quotaWarning = signal<string | null>(null);
  /** Early in the trial the banner offers the setup session instead of the plans. */
  readonly quotaAction = signal<'plans' | 'onboarding'>('plans');
  readonly onboardingUrl = environment.onboardingUrl;

  readonly userName = computed(() => {
    const profile = this.account.profile();
    return profile?.fullName || profile?.email || '';
  });
  readonly businessName = computed(() => this.account.profile()?.business.name ?? 'Tu negocio');
  readonly userEmail = computed(() => this.account.profile()?.email ?? '');
  readonly userInitials = computed(() => {
    const profile = this.account.profile();
    return profile ? initialsOf(profile.fullName, profile.email) : '';
  });

  private readonly baseNavGroups: ConsoleNavGroup[] = [
    {
      id: 'start',
      label: null,
      items: [{ label: 'Inicio', path: '/app/get-started', icon: 'home' }],
    },
    {
      id: 'sell',
      label: null,
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
      label: null,
      items: [
        { label: 'Productos', path: '/app/products', icon: 'package', children: [{ label: 'Inventario', path: '/app/inventory' }, { label: 'Importar catálogo', path: '/app/products/import' }] },
        { label: 'Descuentos', path: '/app/coupons', icon: 'ticketPercent', integration: 'store' },
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
      label: null,
      items: [{ label: 'Métricas', path: '/app/metrics', icon: 'chartColumn' }],
    },
  ];

  private readonly baseFooterItems: ConsoleNavItem[] = [
    { label: 'Ajustes', path: '/app/settings', icon: 'settings' },
  ];
  readonly accountItems: ConsoleNavItem[] = [
    { label: 'Mi perfil', path: '/app/profile', icon: 'user' },
    { label: 'Tu plan', path: '/app/plans', icon: 'creditCard' },
    { label: 'Centro de ayuda', path: '/app/help', icon: 'circleHelp' },
  ];

  /** Pages of active integrations, placed right after their closest sibling. */
  private readonly activeIntegrations = computed(() =>
    INTEGRATIONS.filter((integration) => this.integrations.isActive(integration.key)),
  );

  readonly navGroups = computed<ConsoleNavGroup[]>(() =>
    this.baseNavGroups.map((group) => ({
      ...group,
      items: [
        ...group.items.filter(
          (item) => !item.integration || this.integrations.isActive(item.integration),
        ),
        ...this.activeIntegrations()
          .filter((integration) => integration.group === group.id)
          .map((integration) => ({
            label: integration.navLabel,
            path: integration.path,
            icon: integration.icon,
          })),
      ],
    })),
  );

  readonly footerItems = computed<ConsoleNavItem[]>(() => {
    const team = this.activeIntegrations().filter((integration) => integration.group === 'footer');
    return [
      ...team.map((integration) => ({
        label: integration.navLabel,
        path: integration.path,
        icon: integration.icon,
      })),
      ...this.baseFooterItems,
    ];
  });

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  readonly isHome = computed(() => this.currentUrl().split(/[?#]/)[0] === '/app/get-started');
  readonly context = computed(() => contextForUrl(this.currentUrl()));
  readonly contextGroups = computed(() => this.context()?.groups.map(group => ({ ...group, items: group.items.filter(item => normalizeSearch(item.label).includes(normalizeSearch(this.contextQuery()))) })).filter(group => group.items.length) ?? []);
  readonly contextLocation = computed(() => this.context()?.groups.flatMap(group => group.items).find(item => this.isContextActive(item))?.label);
  isContextActive(item: ContextLink): boolean { return isContextLinkActive(item, this.currentUrl()); }

  readonly currentLocation = computed(() => {
    if (this.context()) return { group: this.context()!.label, label: this.contextLocation() ?? this.context()!.label };
    const path = this.currentUrl().split(/[?#]/)[0];
    for (const group of this.navGroups()) {
      for (const item of group.items) {
        if (path === item.path || path.startsWith(`${item.path}/`) || item.children?.some((entry) => entry.path === path)) {
          const child = item.children?.find((entry) => entry.path === path);
          return { group: child ? item.label : group.label, label: child?.label ?? item.label };
        }
      }
    }
    const item = [...this.footerItems(), ...this.accountItems].find((entry) => entry.path === path);
    const integration = INTEGRATIONS.find((entry) => entry.path === path);
    return {
      group: 'Tu negocio',
      label:
        item?.label ?? integration?.name ?? (path === '/app/profile' ? 'Mi perfil' : 'Consola'),
    };
  });

  readonly contentHref = computed(() => `${this.currentUrl().split('#')[0]}#console-main`);

  /** Parents the user collapsed or expanded by hand; others follow the active route. */
  private readonly toggled = signal<Record<string, boolean>>({});

  isInSection(item: ConsoleNavItem): boolean {
    const path = this.currentUrl().split(/[?#]/)[0];
    return path === item.path || path.startsWith(`${item.path}/`) || Boolean(item.children?.some((entry) => entry.path === path));
  }

  isExpanded(item: ConsoleNavItem): boolean {
    return this.toggled()[item.path] ?? this.isInSection(item);
  }

  toggleItem(item: ConsoleNavItem): void {
    const next = !this.isExpanded(item);
    this.toggled.update((state) => ({ ...state, [item.path]: next }));
  }

  toggleNavigation(): void {
    this.navCollapsed.update((collapsed) => !collapsed);
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLButtonElement>('#console-navigation [data-nav-toggle]')?.focus();
    }, { injector: this.injector });
  }

  readonly paletteActions: PaletteAction[] = [
    {
      id: 'start',
      label: 'Inicio',
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
      hint: 'Conecta el número de tu negocio',
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
      label: 'Descuentos',
      hint: 'Promociones para tu tienda web',
      path: '/app/coupons',
      icon: 'ticketPercent',
      integration: 'store',
    },
    {
      id: 'messages',
      label: 'Mensajes',
      hint: 'Conversaciones y atención a clientes',
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
      id: 'profile',
      label: 'Mi perfil',
      hint: 'Nombre, contraseña y sesiones',
      path: '/app/profile',
      icon: 'user',
    },
    {
      id: 'help',
      label: 'Ayuda',
      hint: 'Guías para operar tu negocio',
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
    actions.push(...CONSOLE_CONTEXTS.flatMap(context => context.groups.flatMap(group => group.items.map(item => ({ id: `context-${item.label}`, label: item.label, hint: context.label, path: item.path + (item.section && item.section !== 'temas' ? `?seccion=${item.section}` : ''), icon: item.icon })))));
    if (!q) return actions;
    return actions.filter(
      (action) => normalizeSearch(q).split(/\s+/).every(token => normalizeSearch(action.label + ' ' + action.hint).includes(token)),
    );
  });
  readonly searchResults = computed(() => {
    const filter = this.paletteFilter();
    const q = normalizeSearch(this.paletteQuery());
    const sections = this.filteredPalette().filter(action => filter === 'todos' || filter === 'productos' && ['/app/products', '/app/inventory', '/app/coupons'].includes(action.path) || filter === 'vendedor' && action.path.startsWith('/app/seller') || filter === 'conexiones' && ['/app/channels', '/app/payments', '/app/integrations', '/app/instagram', '/app/tiktok-live'].includes(action.path) || filter === 'ajustes' && (action.id.startsWith('context-') || ['/app/profile', '/app/help', '/app/plans'].includes(action.path)));
    const unique = [...new Map(sections.map(action => [action.path, action])).values()];
    if (!q && filter === 'todos') return [...new Map([...this.paletteRecent(), ...unique].map(action => [action.path, action])).values()].slice(0, 7);
    const products: PaletteAction[] = (filter === 'todos' || filter === 'productos') && (q || filter === 'productos') ? this.paletteProducts().filter(product => q.split(/\s+/).every(token => normalizeSearch(product.name + ' ' + (product.sku ?? '') + ' ' + (product.brand ?? '') + ' ' + (product.variants ?? []).map(variant => variant.sku ?? '').join(' ')).includes(token))).slice(0, 12).map(product => ({ id: `product-${product.id}`, label: product.name, hint: `Producto${product.sku ? ' · ' + product.sku : ''} · Ver en el catálogo`, path: '/app/products?q=' + encodeURIComponent(product.name), icon: 'package' })) : [];
    return [...products, ...unique.slice(0, 15)];
  });
  readonly selectedSearchResult = computed(() => this.searchResults()[Math.min(this.paletteIndex(), Math.max(0, this.searchResults().length - 1))]);

  constructor() {
    let previousContext: string | undefined;
    let previousCollapsed = false;
    effect(() => {
      const next = this.context()?.id;
      if (next === previousContext) return;
      if (!previousContext && next) previousCollapsed = untracked(this.navCollapsed);
      this.navCollapsed.set(next ? true : previousCollapsed);
      this.contextQuery.set('');
      previousContext = next;
    });
    void this.loadQuotaWarning();
    void this.integrations.refresh().catch(() => undefined);
    void this.account.load().catch(() => undefined);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('dialog') && !this.paletteOpen())
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.paletteOpen()) this.closePalette();
      else if (!this.mobileNavOpen()) this.openPalette();
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
        this.quotaWarning.set(`Llegaste al máximo de ${usage.productQuota} productos de tu plan.`);
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
    this.paletteFilter.set('todos'); this.paletteIndex.set(0); this.paletteFiltersOpen.set(false);
    void this.loadSearchProducts();
  }
  async loadSearchProducts(): Promise<void> {
    if (this.paletteLoading()) return;
    this.paletteLoading.set(true); this.paletteError.set(false);
    try { this.paletteProducts.set(await this.catalog.list()); }
    catch { this.paletteError.set(true); }
    finally { this.paletteLoading.set(false); }
  }
  setSearchFilter(filter: 'todos' | 'productos' | 'vendedor' | 'conexiones' | 'ajustes'): void {
    this.paletteFilter.set(filter); this.paletteIndex.set(0); this.paletteFiltersOpen.set(false);
    this.element.nativeElement.querySelector<HTMLInputElement>('#console-search')?.focus();
  }
  onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault(); const action = this.selectedSearchResult(); if (action) this.runPaletteAction(action); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !this.searchResults().length) return;
    if ((event.key === 'Home' || event.key === 'End') && !event.ctrlKey) return;
    event.preventDefault();
    const total = this.searchResults().length;
    this.paletteIndex.set(event.key === 'Home' ? 0 : event.key === 'End' ? total - 1 : (this.paletteIndex() + (event.key === 'ArrowDown' ? 1 : -1) + total) % total);
    this.element.nativeElement.querySelector('#search-result-' + this.paletteIndex())?.scrollIntoView({ block: 'nearest' });
  }

  closeNavigation(): void {
    this.mobileNavOpen.set(false);
  }

  closePalette(): void {
    this.paletteOpen.set(false);
    this.paletteQuery.set('');
  }

  onPaletteQuery(value: string): void {
    this.paletteQuery.set(value);
    this.paletteIndex.set(0);
  }

  runPaletteAction(action: PaletteAction): void {
    this.paletteRecent.update(recent => [action, ...recent.filter(item => item.path !== action.path)].slice(0, 4));
    this.closePalette();
    if (action.id === 'test-seller') {
      void this.router.navigate(['/app/seller/profile'], {
        queryParams: { playground: '1' },
      });
      return;
    }
    void this.router.navigateByUrl(action.path);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    location.href = '/auth/login';
  }
}
