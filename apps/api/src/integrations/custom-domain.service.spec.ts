import { normalizeDomain } from './custom-domain.service';

describe('normalizeDomain', () => {
  it('keeps only the lowercase hostname', () => {
    expect(normalizeDomain(' https://WWW.MiTienda.pe/productos?x=1 ')).toBe('www.mitienda.pe');
    expect(normalizeDomain('www.mitienda.com.pe:443')).toBe('www.mitienda.com.pe');
    expect(normalizeDomain('tienda.mimarca.pe.')).toBe('tienda.mimarca.pe');
  });

  it('rejects values that are not domains', () => {
    for (const value of ['', 'localhost', '192.168.0.1', 'mi tienda.pe', '-www.mitienda.pe', 'www..pe']) {
      expect(normalizeDomain(value)).toBeNull();
    }
  });
});
