import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/marketing/marketing-home.page').then(
        (m) => m.MarketingHomePage,
      ),
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'invite/:token',
    loadComponent: () =>
      import('./features/auth/invite.page').then((m) => m.InvitePage),
  },
  {
    path: 'payment/:state',
    loadComponent: () =>
      import('./features/payment-result/payment-result.page').then(
        (m) => m.PaymentResultPage,
      ),
  },
  {
    // Full-screen workspace outside the console shell; declared before `app` so it matches first.
    path: 'app/store/editor',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/store/store-editor.page').then((m) => m.StoreEditorPage),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/console-shell.layout').then((m) => m.ConsoleShellLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'get-started' },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/catalog/products.page').then((m) => m.ProductsPage),
      },
      {
        path: 'products/import',
        loadComponent: () =>
          import('./features/catalog/catalog-import.page').then((m) => m.CatalogImportPage),
      },
      {
        path: 'shipping',
        loadComponent: () =>
          import('./features/shipping/shipping.page').then((m) => m.ShippingPage),
      },
      {
        path: 'store',
        loadComponent: () =>
          import('./features/store/store.page').then((m) => m.StorePage),
      },
      {
        path: 'get-started',
        loadComponent: () =>
          import('./features/get-started/get-started.page').then(
            (m) => m.GetStartedPage,
          ),
      },
      { path: 'seller', pathMatch: 'full', redirectTo: 'seller/profile' },
      {
        path: 'seller/:section',
        loadComponent: () =>
          import('./features/seller/seller.page').then((m) => m.SellerPage),
      },
      {
        path: 'channels',
        loadComponent: () =>
          import('./features/channels/channels.page').then(
            (m) => m.ChannelsPage,
          ),
      },
      {
        path: 'messages',
        loadComponent: () =>
          import('./features/messages/messages.page').then(
            (m) => m.MessagesPage,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/orders/orders.page').then((m) => m.OrdersPage),
      },
      {
        path: 'metrics',
        loadComponent: () =>
          import('./features/metrics/metrics.page').then((m) => m.MetricsPage),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/inventory/inventory.page').then((m) => m.InventoryPage),
      },
      {
        path: 'coupons',
        loadComponent: () =>
          import('./features/coupons/coupons.page').then((m) => m.CouponsPage),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/payments/payments.page').then((m) => m.PaymentsPage),
      },
      {
        path: 'integrations',
        loadComponent: () =>
          import('./features/integrations/integrations.page').then(
            (m) => m.IntegrationsPage,
          ),
      },
      {
        path: 'plans',
        loadComponent: () =>
          import('./features/billing/plans.page').then((m) => m.PlansPage),
      },
      {
        path: 'domain',
        loadComponent: () =>
          import('./features/domain/domain.page').then((m) => m.DomainPage),
      },
      {
        path: 'instagram',
        loadComponent: () =>
          import('./features/instagram/instagram.page').then((m) => m.InstagramPage),
      },
      {
        path: 'tracking',
        loadComponent: () =>
          import('./features/tracking/tracking.page').then((m) => m.TrackingPage),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/team/team.page').then((m) => m.TeamPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.page').then(
            (m) => m.SettingsPage,
          ),
      },
      {
        path: 'help',
        loadComponent: () =>
          import('./features/help/help.page').then((m) => m.HelpPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
