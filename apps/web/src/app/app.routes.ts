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
      {
        path: 'seller',
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
