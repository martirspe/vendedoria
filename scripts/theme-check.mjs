import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import themes from '../packages/themes/index.js';
import releases from '../packages/themes/release-lock.js';

const file = process.argv[2];
const values = file ? [JSON.parse(await readFile(file, 'utf8'))] : themes.THEME_CATALOG;
const issues = file ? themes.validateManifest(values[0]) : themes.validateCatalog(values);
if (!file) issues.push(...releases.verifyReleases(values, JSON.parse(await readFile('packages/themes/releases.lock.json', 'utf8'))));
for (const theme of values) {
  issues.push(...themes.compatibility(theme).issues.filter(issue => issue.code !== 'optional_capability'));
  if (!themes.validateManifest(theme).length) {
    try { await access(path.join('apps/web/public', theme.assets.cover)); }
    catch { issues.push({ code: 'cover_missing', path: theme.assets.cover, message: 'La imagen de portada no existe en la consola.' }); }
    const renderer = theme.renderer.split('@')[0];
    if (renderer !== 'classic') {
      try { await access(`apps/store/src/app/templates/${renderer}/${renderer}.routes.ts`); await access(`apps/store/src/app/templates/${renderer}/${renderer}.scss`); }
      catch { issues.push({ code: 'renderer_missing', path: theme.renderer, message: 'Falta el renderer compilado.' }); }
    }
  }
}
if (issues.length) { console.error(JSON.stringify(issues, null, 2)); process.exitCode = 1; }
else console.log(`${values.length} releases válidos. Contratos, capacidades, identidad, composición y assets verificados.`);
