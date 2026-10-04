import { Routes } from '@angular/router';
import { catalogResolver, storeResolver } from '../../app.resolvers';
import { LEGAL_SLUGS } from '../../features/legal/legal-slugs';
import { selectaCatalogResolver, selectaProductResolver } from './selecta-catalog';
import { SelectaShell } from './selecta-shell';

const legal = () => import('./legal.page').then((m) => m.SelectaLegalPage);

/** Selecta template: the same URLs as the classic store, so links and sitemaps keep working. */
export const SELECTA_ROUTES: Routes = [
  {
    path: '',
    component: SelectaShell,
    resolve: { store: storeResolver, catalog: selectaCatalogResolver },
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./home.page').then((m) => m.SelectaHomePage),
      },
      {
        path: 'productos',
        pathMatch: 'full',
        loadComponent: () => import('../../features/catalog/catalog.page').then((m) => m.CatalogPage),
        resolve: { list: catalogResolver },
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
      },
      { path: 'productos/:handle', redirectTo: ({ params }) => `/producto/${params['handle']}` },
      { path: 'terminos', redirectTo: '/terminos-y-condiciones' },
      { path: 'privacidad', redirectTo: '/politica-de-privacidad' },
      {
        path: 'producto/:handle',
        resolve: { productLoaded: selectaProductResolver },
        loadComponent: () => import('./product.page').then((m) => m.SelectaProductPage),
      },
      {
        path: 'carrito',
        loadComponent: () => import('./cart.page').then((m) => m.SelectaCartPage),
      },
      {
        path: 'checkout',
        resolve: { productLoaded: selectaProductResolver },
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        loadComponent: () => import('./checkout.page').then((m) => m.SelectaCheckoutPage),
      },
      {
        path: 'pedido/:id',
        loadComponent: () => import('./order.page').then((m) => m.SelectaOrderPage),
      },
      { path: 'legal', loadComponent: legal },
      ...LEGAL_SLUGS.map((slug) => ({ path: slug, data: { slug }, loadComponent: legal })),
      {
        path: '**',
        loadComponent: () => import('./not-found.page').then((m) => m.SelectaNotFoundPage),
      },
    ],
  },
];
