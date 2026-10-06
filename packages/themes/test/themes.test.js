'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const themes = require('..');
const clone = value => JSON.parse(JSON.stringify(value));
const classic = () => clone(themes.getTheme('classic', '1.1.0'));
const releases = require('../release-lock');

test('sealed releases cannot be changed or removed; new versions are append-only', () => {
  const old = classic(); const lock = releases.sealReleases([old], {});
  assert.deepEqual(releases.verifyReleases([clone(old)], lock), []);
  const changed = clone(old); changed.tokens.primary = '#010203';
  assert.equal(releases.verifyReleases([changed], lock)[0].code, 'release_modified');
  assert.throws(() => releases.sealReleases([changed], lock));
  assert.equal(releases.verifyReleases([], lock)[0].code, 'release_modified');
  const next = clone(old); next.version = '1.2.0';
  const extended = releases.sealReleases([old, next], lock);
  assert.equal(extended[`${old.id}@${old.version}`], lock[`${old.id}@${old.version}`]);
  assert.deepEqual(releases.verifyReleases([old, next], extended), []);
});

test('identity names remain stable and SemVer comparison preserves numeric ordering', () => {
  const renamed = classic(); renamed.displayName = 'Otro nombre';
  assert.ok(themes.validateCatalog([themes.getTheme('classic', '1.0.0'), renamed]).some(issue => issue.code === 'identity_name'));
  assert.equal(themes.compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(themes.compareVersions('9007199254740993.0.0', '9007199254740992.0.0'), 1);
});

test('all shipped releases have unique immutable identities and compatible contracts', () => {
  assert.deepEqual(themes.validateCatalog(), []);
  assert.equal(themes.THEME_CATALOG.length, 6);
  for (const theme of themes.THEME_CATALOG) assert.equal(themes.compatibility(theme).status, 'compatible');
  assert.equal(themes.getTheme('stride', '1.0.0').displayName, 'Impulso');
  assert.equal(themes.getTheme('stride', '1.1.0').id, 'vendedoria/stride');
  assert.ok(Object.isFrozen(themes.getTheme('classic').tokens));
});

test('unknown properties, executable sources, invalid versions and conflicting identities are rejected', () => {
  for (const mutate of [theme => theme.script = 'evil.js', theme => theme.version = '01.0.0', theme => theme.id = 'other/classic', theme => theme.assets.cover = 'https://evil.example/tracker.svg', theme => theme.assets.styles = ['/../evil.css'], theme => theme.sections.push('unregistered')]) {
    const theme = classic(); mutate(theme);
    assert.equal(themes.compatibility(theme).status, 'incompatible');
  }
  const fork = classic(); fork.namespace = 'studio'; fork.id = 'studio/classic';
  assert.ok(themes.validateCatalog([...themes.THEME_CATALOG, fork]).some(issue => issue.code === 'duplicate_slug'));
  assert.ok(themes.validateCatalog([...themes.THEME_CATALOG, classic()]).some(issue => issue.code === 'duplicate_release'));
});

test('schema rejects malformed collections, nested prototype keys and unsupported settings', () => {
  const theme = classic(); theme.presets[0].sections = JSON.parse('{"constructor":{"prototype":"x"}}');
  assert.ok(themes.validateManifest(theme).length);
  const root = JSON.parse(JSON.stringify(classic()).slice(0, -1) + ',"__proto__":{}}');
  assert.ok(themes.validateManifest(root).length);
  for (const mutate of [theme => theme.settings.push('customCss'), theme => theme.contracts.editor = 1.5, theme => theme.sections = {}, theme => theme.presets[0].layout.push({ id: 'hero', type: 'hero' })]) {
    const theme = classic(); mutate(theme); assert.ok(themes.validateManifest(theme).length);
  }
});

test('older contract needs an update; future contracts and unavailable required capabilities cannot activate', () => {
  const environment = clone(themes.THEME_ENVIRONMENT); environment.contracts.editor = 2;
  assert.equal(themes.compatibility(classic(), environment).status, 'update_required');
  const future = classic(); future.contracts.editor = 2;
  assert.equal(themes.compatibility(future).status, 'incompatible');
  const required = classic(); required.capabilities.requires.push('subscriptions');
  assert.equal(themes.compatibility(required).status, 'incompatible');
  const optional = classic(); optional.capabilities.optional.push('wishlist');
  assert.equal(themes.compatibility(optional).status, 'warnings');
});

test('presets preserve edits, explicit empty values, layout, FAQ, branding and the input object', () => {
  const content = { version: 1, sections: { hero: { title: 'Mi texto', text: '' } }, faq: [{ question: 'Q', answer: 'A' }], theme: { primary: '#123456', logo: 'https://example.test/logo.webp' }, layouts: { classic: [{ id: 'faq', type: 'faq' }] } };
  const before = clone(content);
  const result = themes.importPreset(content, classic(), 'original');
  assert.equal(result.sections.hero.title, 'Mi texto');
  assert.equal(result.sections.hero.text, '');
  assert.equal(result.sections.hero.cta, 'Ver catálogo');
  assert.deepEqual(result.layouts, content.layouts);
  assert.deepEqual(result.theme, content.theme);
  assert.deepEqual(result.faq, content.faq);
  assert.deepEqual(content, before);
  assert.throws(() => themes.importPreset(content, classic(), 'missing'));
});

test('editorial samples cannot invent reviews or import unowned assets', () => {
  const review = clone(themes.getTheme('stride')); review.presets[0].sections.voices = { quote1: 'Excelente', author1: 'Persona inventada' };
  assert.ok(themes.validateManifest(review).some(issue => issue.code === 'demo_proof'));
  const image = classic(); image.presets[0].sections.hero.image = 'https://evil.example/a.png';
  assert.ok(themes.validateManifest(image).some(issue => issue.code === 'preset_field'));
});

test('updates use declared migration paths and preserve every merchant customization', () => {
  const content = { version: 1, sections: { hero: { title: '', text: 'Mi tienda' }, footer: { closing: 'Mi frase' } }, theme: { primary: '#010203' }, layouts: { classic: [{ id: 'faq', type: 'faq', hidden: true }] } };
  assert.deepEqual(themes.migrateContent(content, 'classic', '1.0.0', '1.1.0'), content);
  assert.throws(() => themes.migrateContent(content, 'classic', '1.0.0', '9.0.0'));
  assert.throws(() => themes.migrateContent({ ...content, version: 2 }, 'classic', '1.0.0', '1.1.0'));
});

test('sequential migrations are atomic and conflicting overrides stop before data is written', () => {
  const releases = [{ slug: 'sample', migrations: [{ from: '1.0.0', to: '1.1.0', renameFields: [{ from: 'hero.title', to: 'banner.title' }] }] }, { slug: 'sample', migrations: [{ from: '1.1.0', to: '2.0.0', renameFields: [{ from: 'banner.title', to: 'closing.title' }] }] }];
  const content = { version: 1, sections: { hero: { title: 'Mi texto' } } };
  const result = themes.migrateContent(content, 'sample', '1.0.0', '2.0.0', releases);
  assert.equal(result.sections.closing.title, 'Mi texto');
  assert.equal(content.sections.hero.title, 'Mi texto');
  const conflict = { version: 1, sections: { hero: { title: 'A' }, banner: { title: 'B' } } };
  assert.throws(() => themes.migrateContent(conflict, 'sample', '1.0.0', '2.0.0', releases));
  assert.equal(conflict.sections.hero.title, 'A');
  const unsafe = [{ slug: 'sample', migrations: [{ from: '1.0.0', to: '1.1.0', renameFields: [{ from: 'hero.title', to: '__proto__.polluted' }] }] }];
  assert.throws(() => themes.migrateContent(content, 'sample', '1.0.0', '1.1.0', unsafe));
  assert.equal({}.polluted, undefined);
});

test('a third party can define a unique declarative theme with the existing renderer contract', () => {
  const theme = classic(); theme.slug = 'studio-local'; theme.namespace = 'studio'; theme.id = 'studio/studio-local'; theme.version = '1.0.0'; theme.migrations = []; theme.tokens.primary = '#203040';
  assert.deepEqual(themes.validateManifest(theme), []);
  assert.equal(themes.compatibility(theme).status, 'compatible');
  assert.deepEqual(themes.validateCatalog([...themes.THEME_CATALOG, theme]), []);
});
