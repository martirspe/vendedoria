// Compiles the INEI district list into data/ubigeos.json. Run from apps/api:
//   node scripts/compile-ubigeos.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const csv = await readFile('data/ubigeo-inei-2025.csv', 'utf8');
const rows = csv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const r = line.split(';');
    return { code: r[3], department: r[0], province: r[1], district: r[2], lat: Number(r[8]), lon: Number(r[9]) };
  });
// New district confirmed in MEF's 2026 municipal annex; no invented coordinates.
rows.push({ code: '160405', department: 'Loreto', province: 'Mariscal Ramón Castilla', district: 'Santa Rosa de Loreto', lat: null, lon: null });
rows.sort((a, b) => a.code.localeCompare(b.code));

assert.equal(rows.length, 1892);
assert.equal(new Set(rows.map((r) => r.code)).size, 1892);
assert.equal(new Set(rows.map((r) => r.code.slice(0, 2))).size, 25);
assert.equal(new Set(rows.map((r) => r.code.slice(0, 4))).size, 196);
assert(rows.every((r) => /^\d{6}$/.test(r.code) && r.department && r.province && r.district));

await writeFile('data/ubigeos.json', JSON.stringify(rows));
await writeFile(
  'data/ubigeos-provenance.json',
  JSON.stringify(
    {
      compiledOn: '2026-10-01',
      districts: rows.length,
      departments: 25,
      provinces: 196,
      source: 'https://github.com/yull23/ubigeos_peru/blob/main/databases/ubigeo_inei_2025.csv',
      newDistrictVerification:
        'https://cdn.www.gob.pe/uploads/document/file/9970947/8132784-reporte-trimestral-de-finanzas-y-reglas-fiscales-gr-gl-1trim2026.pdf',
      notes:
        'Snapshot de 1891 distritos INEI 2025 más Santa Rosa de Loreto (160405), confirmado en el anexo municipal MEF 2026. Coordenadas de capitales distritales para estimación geográfica, no distancia de ruta ni tarifa oficial. Revisar nuevos ubigeos al actualizar el catálogo.',
    },
    null,
    2,
  ),
);
console.log('Ubigeos verificados: 25 departamentos, 196 provincias, 1892 distritos.');
