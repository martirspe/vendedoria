import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UbigeoDistrict } from '@vendedoria/contracts';

type UbigeoRow = UbigeoDistrict & { lat: number | null; lon: number | null };

/** INEI 2025 districts compiled by `scripts/compile-ubigeos.mjs` (resolves from src/ and dist/). */
const ROWS: UbigeoRow[] = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'data', 'ubigeos.json'), 'utf8'),
) as UbigeoRow[];

const BY_CODE = new Map(ROWS.map((row) => [row.code, row]));

export const UBIGEO_DISTRICTS: UbigeoDistrict[] = ROWS.map(({ code, department, province, district }) => ({
  code,
  department,
  province,
  district,
}));

export function findUbigeo(code: string): UbigeoDistrict | null {
  const row = BY_CODE.get(code);
  return row
    ? { code: row.code, department: row.department, province: row.province, district: row.district }
    : null;
}

/** Lima Metropolitana (province 1501) and Callao (department 07) use the store's Lima rate. */
export function shippingZone(code: string): 'LIMA' | 'PROVINCE' {
  return code.startsWith('1501') || code.startsWith('07') ? 'LIMA' : 'PROVINCE';
}
