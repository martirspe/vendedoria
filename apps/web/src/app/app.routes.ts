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
      { path: '', pathMatch: 'full', redirectTo: 'products' },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/catalog/products.page').then((m) => m.ProductsPage),
      },
      {
        path: 'get-started',
        loadComponent: () =>
          import('./features/shared/placeholder.page').then((m) => m.PlaceholderPage),
        data: {
          title: 'Empezar',
          emptyTitle: 'Onboarding',
          emptyBody: 'Checklist guiado hasta tu primer agente vendiendo.',
        },
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
          import('./features/shared/placeholder.page').then((m) => m.PlaceholderPage),
        data: {
          title: 'Métricas',
          emptyTitle: 'Resultados',
          emptyBody: 'Ventas, conversaciones y tasa de conversión.',
        },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/shared/placeholder.page').then((m) => m.PlaceholderPage),
        data: {
          title: 'Ajustes',
          emptyTitle: 'Tu negocio',
          emptyBody: 'Nombre, país, moneda y preferencias del tenant.',
        },
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
