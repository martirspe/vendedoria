import { readFile, writeFile } from 'node:fs/promises';
import themes from '../packages/themes/index.js';
import releases from '../packages/themes/release-lock.js';

const issues = themes.validateCatalog();
if (issues.length) throw new Error(JSON.stringify(issues));
const target = 'packages/themes/releases.lock.json';
const lock = JSON.parse(await readFile(target, 'utf8'));
const next = releases.sealReleases(themes.THEME_CATALOG, lock);
await writeFile(target, JSON.stringify(next, null, 2) + '\n');
console.log(`${Object.keys(next).length} releases sellados. Se conservaron todas las huellas anteriores.`);
