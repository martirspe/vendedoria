import {
  isValidStoreSlug,
  slugFromHost,
  storefrontBaseDomain,
  storefrontUrl,
} from './storefront-host';

describe('storefront host resolution', () => {
  it('derives the base domain from the URL template', () => {
    expect(storefrontBaseDomain('http://{slug}.localhost:4300')).toBe('localhost');
    expect(storefrontBaseDomain('https://{slug}.tiendas.example.pe')).toBe(
      'tiendas.example.pe',
    );
  });

  it('builds the public store URL', () => {
    expect(storefrontUrl('https://{slug}.tiendas.example.pe', 'acme-1a2b3c')).toBe(
      'https://acme-1a2b3c.tiendas.example.pe',
    );
  });

  it('extracts a single-label slug and ignores port and case', () => {
    expect(slugFromHost('Acme-1a2b3c.localhost:4300', 'localhost')).toBe('acme-1a2b3c');
    expect(slugFromHost('acme.tiendas.example.pe', 'tiendas.example.pe')).toBe('acme');
  });

  it('rejects hosts outside the base domain, nested labels and bare domains', () => {
    expect(slugFromHost('acme.evil.pe', 'tiendas.example.pe')).toBeNull();
    expect(slugFromHost('a.b.localhost', 'localhost')).toBeNull();
    expect(slugFromHost('localhost:4300', 'localhost')).toBeNull();
    expect(slugFromHost('xlocalhost', 'localhost')).toBeNull();
    expect(slugFromHost('-acme.localhost', 'localhost')).toBeNull();
  });

  it('validates slugs as DNS labels', () => {
    expect(isValidStoreSlug('tienda-123')).toBe(true);
    expect(isValidStoreSlug('Tienda')).toBe(false);
    expect(isValidStoreSlug('tienda-')).toBe(false);
    expect(isValidStoreSlug('a'.repeat(64))).toBe(false);
  });
});
