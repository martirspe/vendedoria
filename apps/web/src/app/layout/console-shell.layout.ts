import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthApiService } from '../core/auth/auth-api.service';
import { BillingApiService } from '../core/api/billing-api.service';
import {
  DsIconComponent,
  DsIconName,
} from '@vendedoria/ui';

type ConsoleNavItem = {
  label: string;
  path: string;
  icon: DsIconName;
};

type ConsoleNavGroup = {
  id: string;
  label: string;
  items: ConsoleNavItem[];
};

type PaletteAction = {
  id: string;
  label: string;
  hint: string;
  path: string;
  icon: DsIconName;
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
  private readonly router = inject(Router);

  readonly paletteOpen = signal(false);
  readonly paletteQuery = signal('');
  readonly quotaWarning = signal<string | null>(null);

  readonly navGroups: ConsoleNavGroup[] = [
    {
      id: 'sell',
      label: 'Vender',
      items: [
        { label: 'Empezar', path: '/app/get-started', icon: 'rocket' },
        { label: 'Productos', path: '/app/products', icon: 'package' },
        { label: 'Vendedor', path: '/app/seller', icon: 'bot' },
        { label: 'Canales', path: '/app/channels', icon: 'radio' },
        { label: 'Mensajes', path: '/app/messages', icon: 'message' },
        { label: 'Pedidos', path: '/app/orders', icon: 'shoppingBag' },
      ],
    },
    {
      id: 'business',
      label: 'Negocio',
      items: [
        { label: 'Métricas', path: '/app/metrics', icon: 'chartColumn' },
        { label: 'Integraciones', path: '/app/integrations', icon: 'plug' },
        { label: 'Planes', path: '/app/plans', icon: 'creditCard' },
        { label: 'Ajustes', path: '/app/settings', icon: 'settings' },
        { label: 'Ayuda', path: '/app/help', icon: 'circleHelp' },
      ],
    },
  ];

  readonly paletteActions: PaletteAction[] = [
    {
      id: 'start',
      label: 'Empezar',
      hint: 'Checklist para vender',
      path: '/app/get-started',
      icon: 'rocket',
    },
    {
      id: 'whatsapp',
      label: 'Conectar WhatsApp',
      hint: 'Canales · Meta Cloud API',
      path: '/app/channels',
      icon: 'radio',
    },
    {
      id: 'test-seller',
      label: 'Probar vendedor',
      hint: 'Playground sin producción',
      path: '/app/seller',
      icon: 'bot',
    },
    {
      id: 'products',
      label: 'Productos',
      hint: 'Catálogo vendible',
      path: '/app/products',
      icon: 'package',
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
      hint: 'Flujo B · pagos',
      path: '/app/orders',
      icon: 'shoppingBag',
    },
    {
      id: 'plans',
      label: 'Planes',
      hint: 'Cuotas flujo A',
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
    if (!q) return this.paletteActions;
    return this.paletteActions.filter(
      (action) =>
        action.label.toLowerCase().includes(q) ||
        action.hint.toLowerCase().includes(q),
    );
  });

  constructor() {
    void this.loadQuotaWarning();
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
      if (usage.conversationAtLimit) {
        this.quotaWarning.set(
          `Límite mensual de conversaciones alcanzado (${usage.conversationsUsed}/${usage.conversationQuota}).`,
        );
      } else if (usage.productAtLimit) {
        this.quotaWarning.set(
          `Límite de productos alcanzado (${usage.productsUsed}/${usage.productQuota}).`,
        );
      } else if (
        usage.conversationQuota &&
        usage.conversationsUsed / usage.conversationQuota >= 0.85
      ) {
        this.quotaWarning.set(
          `Cerca del límite de conversaciones (${usage.conversationsUsed}/${usage.conversationQuota}).`,
        );
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
      void this.router.navigate(['/app/seller'], {
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
