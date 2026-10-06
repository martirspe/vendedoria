'use strict';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const THEME_CATALOG = freeze(require('./catalog.json'));
const THEME_ENVIRONMENT = freeze({
  contracts: { engine: 1, editor: 1, storefront: 1, content: 1 },
  capabilities: ['catalog', 'cart', 'checkout', 'seo', 'variants', 'search', 'filters', 'coupons', 'services', 'digitalProducts', 'recommendations', 'whatsapp'],
  renderers: ['classic@1', 'selecta@1', 'stride@1'],
});

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    const left = BigInt(a.split('.')[i]);
    const right = BigInt(b.split('.')[i]);
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

function getTheme(slug, version) {
  const releases = THEME_CATALOG.filter(theme => theme.slug === slug);
  return version ? releases.find(theme => theme.version === version) : releases.sort((a, b) => compareVersions(b.version, a.version))[0];
}

function latestThemes() {
  return [...new Set(THEME_CATALOG.map(theme => theme.slug))].map(slug => getTheme(slug));
}

exports.THEME_CATALOG = THEME_CATALOG;
exports.THEME_ENVIRONMENT = THEME_ENVIRONMENT;
exports.compareVersions = compareVersions;
exports.getTheme = getTheme;
exports.latestThemes = latestThemes;
