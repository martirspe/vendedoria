const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const DEFAULT_STOREFRONT_URL_TEMPLATE = 'http://{slug}.localhost:4300';

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
