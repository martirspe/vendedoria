const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const DEFAULT_STOREFRONT_URL_TEMPLATE = 'http://{slug}.localhost:4300';

/** Subdomains a merchant can pick: 3–40 chars, no `--` (reserved for punycode `xn--`). */
export const CHOOSABLE_SLUG = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Platform, infrastructure and impersonation-prone names no store may use. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'apps', 'assets', 'auth', 'billing', 'blog', 'cdn', 'checkout', 'consola', 'console',
  'dashboard', 'dev', 'docs', 'email', 'ftp', 'help', 'imap', 'login', 'mail', 'media', 'ns1', 'ns2', 'pagos',
  'panel', 'pay', 'payments', 'pop', 'preview', 'smtp', 'soporte', 'staging', 'static', 'status', 'store',
  'support', 'test', 'tienda', 'tiendas', 'vendedoria', 'webhook', 'webhooks', 'webmail', 'www',
]);

export function isValidStoreSlug(slug: string): boolean {
  return DNS_LABEL.test(slug);
}

/** Hostname (without port) that every store subdomain hangs from, e.g. `localhost` or `tiendas.example.pe`. */
export function storefrontBaseDomain(urlTemplate: string): string {
  const hostname = new URL(urlTemplate.replace('{slug}', 'x')).hostname;
  return hostname.replace(/^x\./, '');
}

export function storefrontUrl(urlTemplate: string, slug: string): string {
  return urlTemplate.replace('{slug}', slug);
}

/** Store URL on its own domain, with the scheme and port of the platform stores. */
export function customDomainUrl(urlTemplate: string, domain: string): string {
  const base = new URL(urlTemplate.replace('{slug}', 'x'));
  return `${base.protocol}//${domain}${base.port ? `:${base.port}` : ''}`;
}

/**
 * Extracts the tenant slug from a request host such as `acme-1a2b3c.localhost:4300`.
 * Only a single label directly under the base domain is accepted.
 */
export function slugFromHost(host: string, baseDomain: string): string | null {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }
  const label = hostname.slice(0, -suffix.length);
  return isValidStoreSlug(label) ? label : null;
}
