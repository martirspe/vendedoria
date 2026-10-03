import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import type { SitemapEntry, StoreResolveResult } from '@vendedoria/contracts';
import {
  PREVIEW_HEADER,
  STORE_PROXY_PREFIX,
  StoreRequestContext,
  TURNSTILE_HEADER,
} from './app/core/store-context';
import { LEGAL_SLUGS } from './app/features/legal/legal-slugs';

const API_URL = (process.env['STORE_API_URL'] ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
const ALLOWED_HOSTS = (process.env['STORE_ALLOWED_HOSTS'] ?? 'localhost,*.localhost')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const PREVIEW_COOKIE = 'store_preview';
const PREVIEW_TOKEN = /^\d{10}\.[A-Za-z0-9_-]{43}$/;
const LOOPBACK_IP_HOST = /^(?:127\.0\.0\.1|\[::1\])(:\d+)?$/;
const RESOLVE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
/** Paying waits for Mercado Pago (12 s) plus our own work. */
const PAY_TIMEOUT_MS = 25_000;
/** Only these endpoints of the tenant store are reachable through the proxy. */
const PROXY_GET = /^(products(\/[^/]+)?|catalog|orders\/[a-z0-9]{20,40}|ubigeos|shipping-quote)?$/;
const PROXY_POST = /^(checkout|coupons\/preview|orders\/[a-z0-9]{20,40}\/(pay|cancel|simulate))$/;

/** Mercado Pago SDK, Card Payment Brick and Yape tokenization. */
const MP = 'https://*.mercadopago.com https://*.mercadopago.com.pe https://*.mercadolibre.com https://*.mlstatic.com';
/** Cloudflare Turnstile script and challenge iframe on the checkout. */
const TURNSTILE = 'https://challenges.cloudflare.com';
const TURNSTILE_TOKEN_MAX = 2048;
/** GA4 and Meta Pixel: loaded only for stores with analytics and after the buyer accepts cookies. */
const ANALYTICS_SCRIPTS = 'https://www.googletagmanager.com https://connect.facebook.net';
const ANALYTICS_CONNECT =
  'https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.facebook.com https://connect.facebook.net';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com ${MP} ${TURNSTILE} ${ANALYTICS_SCRIPTS}`,
  `style-src 'self' 'unsafe-inline' https://*.mlstatic.com`,
  "img-src 'self' https: data:",
  "font-src 'self' https://fonts.gstatic.com https://*.mlstatic.com",
  `connect-src 'self' https://api.mercadopago.com ${MP} ${ANALYTICS_CONNECT}`,
  `frame-src https://sdk.mercadopago.com ${MP} ${TURNSTILE}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' https://*.mercadopago.com",
  "object-src 'none'",
].join('; ');

type ResolvedStore = {
  slug: string;
  previewToken: string | null;
  /** Served on the tenant's own verified domain instead of a platform subdomain. */
  customDomain: boolean;
};

type ResolveOutcome = StoreResolveResult | { missing: true } | { failed: true };

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const angularApp = new AngularNodeAppEngine({ allowedHosts: ALLOWED_HOSTS });
/**
 * Own domains are arbitrary hosts. This engine is only reached after the API confirmed the
 * Host is a verified domain of an active store, which is the host validation Angular asks for.
 */
let customDomainApp: AngularNodeAppEngine | null = null;
const resolveCache = new Map<string, { store: StoreResolveResult | null; expiresAt: number }>();

app.disable('x-powered-by');
app.set('trust proxy', 'loopback, uniquelocal');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isMainModule(import.meta.url) || process.env['pm_id']) {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  }
  next();
});

/** Dev server only: stores resolve from `{slug}.localhost`, so loopback IP URLs move there. */
if (!isMainModule(import.meta.url) && !process.env['pm_id']) {
  app.use((req, res, next) => {
    const loopback = LOOPBACK_IP_HOST.exec(req.get('host') ?? '');
    if (!loopback) {
      next();
      return;
    }
    res.redirect(308, `${req.protocol}://localhost${loopback[1] ?? ''}${req.originalUrl}`);
  });
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/** Every remaining route belongs to exactly one tenant, derived from the host. */
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const host = req.get('host') ?? '';
  const outcome = await resolveHost(host);
  if ('failed' in outcome) {
    res.status(503).type('html').send(statusPage('Tienda no disponible', 'Intenta de nuevo en unos minutos.'));
    return;
  }
  if ('missing' in outcome) {
    res.status(404).type('html').send(statusPage('Tienda no encontrada', 'Revisa que la dirección sea correcta.'));
    return;
  }
  if (outcome.moved) {
    // Temporary on purpose: the merchant may move back to this subdomain, and a cached 301 would loop.
    const rest = host.slice(host.indexOf('.'));
    res.redirect(302, `${req.protocol}://${outcome.slug}${rest}${req.originalUrl}`);
    return;
  }
  const hostname = host.toLowerCase().replace(/:\d+$/, '');
  const customDomain = outcome.primaryHost === hostname;
  if (
    outcome.primaryHost &&
    !customDomain &&
    (req.method === 'GET' || req.method === 'HEAD') &&
    !req.path.startsWith(STORE_PROXY_PREFIX)
  ) {
    // Temporary so the store can drop its own domain without buyers stuck on a cached redirect.
    const port = /:\d+$/.exec(host)?.[0] ?? '';
    res.redirect(302, `${req.protocol}://${outcome.primaryHost}${port}${req.originalUrl}`);
    return;
  }

  const fromQuery = typeof req.query['preview'] === 'string' ? req.query['preview'] : null;
  if (fromQuery && PREVIEW_TOKEN.test(fromQuery)) {
    res.cookie(PREVIEW_COOKIE, fromQuery, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 60 * 60 * 1000,
      path: '/',
    });
    const clean = new URL(req.originalUrl, 'http://store.local');
    clean.searchParams.delete('preview');
    res.redirect(302, clean.pathname + clean.search);
    return;
  }

  const cookie = readCookie(req, PREVIEW_COOKIE);
  const store: ResolvedStore = {
    slug: outcome.slug,
    previewToken: cookie && PREVIEW_TOKEN.test(cookie) ? cookie : null,
    customDomain,
  };
  res.locals['store'] = store;
  next();
});

app.use(STORE_PROXY_PREFIX, express.json({ limit: '32kb' }), async (req: Request, res: Response) => {
  const path = req.path.replace(/^\/+|\/+$/g, '');
  const post = req.method === 'POST';
  if (!post && req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  if (!(post ? PROXY_POST : PROXY_GET).test(path)) {
    res.status(404).json({ message: 'Not found' });
    return;
  }
  if (post && !sameOrigin(req)) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }
  const store = res.locals['store'] as ResolvedStore;
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const turnstile = post ? req.get(TURNSTILE_HEADER) : undefined;
  try {
    const upstream = await fetch(`${API_URL}/storefront/${store.slug}${path ? `/${path}` : ''}${query}`, {
      method: req.method,
      headers: {
        ...previewHeaders(store),
        ...(post ? { 'content-type': 'application/json' } : {}),
        ...(req.ip ? { 'x-forwarded-for': req.ip } : {}),
        ...(turnstile && turnstile.length <= TURNSTILE_TOKEN_MAX ? { [TURNSTILE_HEADER]: turnstile } : {}),
      },
      ...(post ? { body: JSON.stringify(req.body ?? {}) } : {}),
      signal: AbortSignal.timeout(post ? PAY_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS),
    });
    res.status(upstream.status);
    for (const header of ['content-type', 'cache-control']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ message: 'Store API unavailable' });
  }
});

app.get('/robots.txt', (req: Request, res: Response) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /carrito\nDisallow: /checkout\nDisallow: /pedido/\n\nSitemap: ${origin(req)}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req: Request, res: Response) => {
  const store = res.locals['store'] as ResolvedStore;
  try {
    const upstream = await fetch(`${API_URL}/storefront/${store.slug}/sitemap`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).end();
      return;
    }
    const entries = (await upstream.json()) as SitemapEntry[];
    const base = origin(req);
    const urls = [
      `<url><loc>${base}/</loc></url>`,
      `<url><loc>${base}/productos</loc></url>`,
      ...['legal', ...LEGAL_SLUGS].map((slug) => `<url><loc>${base}/${slug}</loc></url>`),
      ...entries.map(
        (entry) =>
          `<url><loc>${base}/producto/${encodeURIComponent(entry.handle)}</loc><lastmod>${entry.updatedAt}</lastmod></url>`,
      ),
    ];
    res
      .type('application/xml')
      .setHeader('Cache-Control', 'public, max-age=600')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  } catch {
    res.status(502).end();
  }
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const store = res.locals['store'] as ResolvedStore;
  const context: StoreRequestContext = {
    apiBase: `${API_URL}/storefront/${store.slug}`,
    previewToken: store.previewToken,
    origin: origin(req),
  };
  if (store.previewToken) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  const engine = store.customDomain
    ? (customDomainApp ??= new AngularNodeAppEngine({ allowedHosts: ['*'] }))
    : angularApp;
  engine
    .handle(req, context)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

async function resolveHost(host: string): Promise<ResolveOutcome> {
  const key = host.toLowerCase();
  const cached = resolveCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.store ?? { missing: true };
  }
  let store: StoreResolveResult | null = null;
  try {
    const response = await fetch(`${API_URL}/storefront/resolve?host=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as StoreResolveResult;
      store = {
        slug: body.slug,
        moved: body.moved === true,
        primaryHost: typeof body.primaryHost === 'string' ? body.primaryHost : null,
      };
    } else if (response.status !== 404 && response.status !== 400) {
      return { failed: true };
    }
  } catch (error) {
    console.error('Store resolution failed', error);
    return { failed: true };
  }
  if (resolveCache.size > 5000) {
    resolveCache.clear();
  }
  resolveCache.set(key, { store, expiresAt: Date.now() + RESOLVE_TTL_MS });
  return store ?? { missing: true };
}

function previewHeaders(store: ResolvedStore): Record<string, string> {
  return store.previewToken ? { [PREVIEW_HEADER]: store.previewToken } : {};
}

function origin(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

/** Writes must come from pages of the same store (blocks cross-site form posts). */
function sameOrigin(req: Request): boolean {
  const source = req.get('origin') ?? req.get('referer');
  if (!source) return false;
  try {
    return new URL(source).host === req.get('host');
  } catch {
    return false;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(value.join('='));
    }
  }
  return undefined;
}

function statusPage(title: string, message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#111318;background:#f6f7f9;text-align:center;padding:2rem}h1{font-size:1.6rem;margin:0 0 .5rem}p{color:#5b6472;margin:0}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4300;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Store server listening on http://localhost:${port}`);
  });
}

/** Request handler used by the Angular CLI (dev server and build). */
export const reqHandler = createNodeRequestHandler(app);
