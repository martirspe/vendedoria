import { Routes } from '@angular/router';
import {
  catalogResolver,
  featuredResolver,
  productResolver,
  storeResolver,
} from './app.resolvers';
import { StoreShellLayout } from './layout/store-shell.layout';

export const routes: Routes = [
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
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
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
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
