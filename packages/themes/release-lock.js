'use strict';
const { createHash } = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function fingerprint(theme) {
  return createHash('sha256').update(JSON.stringify(canonical(theme))).digest('hex');
}
function verifyReleases(themes, lock, requireSealed = true) {
  const releases = new Map(themes.map(theme => [`${theme.id}@${theme.version}`, fingerprint(theme)]));
  const issues = [];
  for (const [key, hash] of Object.entries(lock)) {
    if (!releases.has(key) || releases.get(key) !== hash) issues.push({ code: 'release_modified', path: key, message: 'Un release publicado no se puede modificar ni eliminar. Crea otra versión.' });
  }
  if (requireSealed) for (const key of releases.keys()) if (!Object.hasOwn(lock, key)) issues.push({ code: 'release_unsealed', path: key, message: 'Valida y sella el nuevo release antes de distribuirlo.' });
  return issues;
}
function sealReleases(themes, lock) {
  if (verifyReleases(themes, lock, false).length) throw new Error('No se puede reemplazar un release sellado.');
  return { ...lock, ...Object.fromEntries(themes.map(theme => [`${theme.id}@${theme.version}`, fingerprint(theme)])) };
}
Object.assign(exports, { fingerprint, verifyReleases, sealReleases });
