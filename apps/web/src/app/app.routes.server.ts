import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // The console needs the session stored in the browser; rendering it at build time would call the API.
  {
    path: 'app/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'invite/:token',
    renderMode: RenderMode.Client
  },
  {
    path: 'payment/:state',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => [{ state: 'success' }, { state: 'pending' }, { state: 'failure' }]
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
