import { Routes } from '@angular/router';
import {
  catalogResolver,
  featuredResolver,
  productResolver,
  storeResolver,
  templateMatch,
} from './app.resolvers';
import { LEGAL_SLUGS } from './features/legal/legal-slugs';
import { StoreShellLayout } from './layout/store-shell.layout';
import { CartService } from './core/cart.service';

export const routes: Routes = [
  {
    path: 'live-checkout',
    component: StoreShellLayout,
    providers: [CartService],
    resolve: { store: storeResolver },
    children: [{ path: '', loadComponent: () => import('./features/checkout/checkout.page').then((m) => m.CheckoutPage) }],
  },
  {
    path: '',
    canMatch: [templateMatch('stride')],
    loadChildren: () => import('./templates/stride/stride.routes').then((m) => m.STRIDE_ROUTES),
  },
  {
    path: '',
    canMatch: [templateMatch('selecta')],
    loadChildren: () =>
      import('./templates/selecta/selecta.routes').then((m) => m.SELECTA_ROUTES),
  },
  {
    path: '',
    component: StoreShellLayout,
    resolve: { store: storeResolver },
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/home/home.page').then((m) => m.HomePage),
        resolve: { featured: featuredResolver },
      },
      {
        path: 'productos',
        loadComponent: () =>
          import('./features/catalog/catalog.page').then((m) => m.CatalogPage),
        resolve: { list: catalogResolver },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'producto/:handle',
        loadComponent: () =>
          import('./features/product/product.page').then((m) => m.ProductPage),
        resolve: { product: productResolver },
      },
      {
        path: 'carrito',
        loadComponent: () =>
          import('./features/cart/cart.page').then((m) => m.CartPage),
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('./features/checkout/checkout.page').then((m) => m.CheckoutPage),
      },
      {
        path: 'pedido/:id',
        loadComponent: () =>
          import('./features/order/order.page').then((m) => m.OrderPage),
      },
      {
        path: 'legal',
        loadComponent: () => import('./features/legal/legal.page').then((m) => m.LegalPage),
      },
      ...LEGAL_SLUGS.map((slug) => ({
        path: slug,
        data: { slug },
        loadComponent: () => import('./features/legal/legal.page').then((m) => m.LegalPage),
      })),
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
