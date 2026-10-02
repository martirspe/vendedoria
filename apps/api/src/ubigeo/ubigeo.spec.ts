import { findUbigeo, UBIGEO_DISTRICTS } from './ubigeo';

describe('ubigeo', () => {
  it('loads the INEI 2025 list with 25 departments and 196 provinces', () => {
    expect(UBIGEO_DISTRICTS).toHaveLength(1892);
    expect(new Set(UBIGEO_DISTRICTS.map((d) => d.code.slice(0, 2))).size).toBe(25);
    expect(new Set(UBIGEO_DISTRICTS.map((d) => d.code.slice(0, 4))).size).toBe(196);
    expect(UBIGEO_DISTRICTS[0]).toEqual({
      code: '010101',
      department: 'Amazonas',
      province: 'Chachapoyas',
      district: 'Chachapoyas',
    });
  });

  it('finds districts by code, including Santa Rosa de Loreto', () => {
    expect(findUbigeo('150122')).toMatchObject({ district: 'Miraflores', province: 'Lima' });
    expect(findUbigeo('160405')).toMatchObject({ district: 'Santa Rosa de Loreto', department: 'Loreto' });
    expect(findUbigeo('999999')).toBeNull();
  });
});
