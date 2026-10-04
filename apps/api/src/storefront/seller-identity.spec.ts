import { publicSellerIdentity, sellerIdentityComplete } from './seller-identity';

const business = {
  sellerType: 'BUSINESS' as const,
  legalName: 'Casa Andina S.A.C.',
  ruc: '20123456789',
  legalAddress: 'Av. Larco 123, Miraflores',
  dni: null,
  legalDistrict: null,
};

const individual = {
  sellerType: 'INDIVIDUAL' as const,
  legalName: 'Ana Quispe Mamani',
  ruc: null,
  legalAddress: 'Jr. Las Flores 456, Dpto. 3',
  dni: '45678912',
  legalDistrict: 'Comas, Lima',
};

describe('seller identity', () => {
  it('shows RUC and fiscal address for businesses', () => {
    expect(publicSellerIdentity(business)).toEqual({
      legalName: 'Casa Andina S.A.C.',
      ruc: '20123456789',
      legalAddress: 'Av. Larco 123, Miraflores',
    });
  });

  it('never exposes DNI, RUC or home address of sellers without RUC', () => {
    const identity = publicSellerIdentity({ ...individual, ruc: '10456789123' });
    expect(identity).toEqual({ legalName: 'Ana Quispe Mamani', ruc: null, legalAddress: 'Comas, Lima' });
    expect(JSON.stringify(identity)).not.toContain('45678912');
  });

  it('requires a valid RUC only for businesses', () => {
    expect(sellerIdentityComplete(business)).toBe(true);
    expect(sellerIdentityComplete({ ...business, ruc: '123' })).toBe(false);
    expect(sellerIdentityComplete(individual)).toBe(true);
  });

  it('requires DNI, district and notification address for sellers without RUC', () => {
    expect(sellerIdentityComplete({ ...individual, dni: '1234' })).toBe(false);
    expect(sellerIdentityComplete({ ...individual, legalDistrict: null })).toBe(false);
    expect(sellerIdentityComplete({ ...individual, legalAddress: null })).toBe(false);
  });
});
