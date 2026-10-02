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

/** Great-circle kilometers between two districts; null when either has no coordinates. */
export function distanceKm(fromCode: string, toCode: string): number | null {
  const a = BY_CODE.get(fromCode);
  const b = BY_CODE.get(toCode);
  if (!a || !b || a.lat === null || a.lon === null || b.lat === null || b.lon === null) return null;
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Lima Metropolitana (province 1501) and Callao (department 07) use the store's Lima rate. */
export function shippingZone(code: string): 'LIMA' | 'PROVINCE' {
  return code.startsWith('1501') || code.startsWith('07') ? 'LIMA' : 'PROVINCE';
}
