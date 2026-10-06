import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableTextOn, storeTheme, storeBrand } from '../src/app/core/theme.ts';
import { themeNavigation, themeSocialLinks } from '../src/app/core/theme-navigation.ts';
import { storeHomeSections } from '../src/app/core/store-layout.ts';
import { templateDemoFromPath } from '../src/app/core/template-demo-path.ts';
import { demoStore, demoResponse } from '../src/app/demos/template-demo-data.ts';

test('release defaults resolve below explicit merchant overrides and empty logo', () => {
  const store = demoStore('stride');
  store.templateContent.theme = { primary: '#123456', logo: '' };
  store.logoUrl = 'https://own.example/logo.webp';
  assert.equal(storeTheme(store).accent, '#c8f542');
  assert.equal(storeBrand(store).primary, '#123456');
  assert.equal(storeBrand(store).logo, null);
  assert.equal(store.templateContent.theme.accent, undefined);
});

test('custom navigation preserves original menu or explicit hide and bounds routes', () => {
  assert.equal(themeNavigation({ version: 1, sections: {} }), null);
  assert.deepEqual(themeNavigation({ version: 1, sections: { navigation: { label1: '' } } }), []);
  const content = { version: 1, sections: { navigation: { label1: ' Catálogo ', destination1: '/productos', label2: 'Danger', destination2: 'javascript:alert(1)' }, social: { instagram: 'https://www.instagram.com/merchant', facebook: 'https://facebook.com.evil.example/a', tiktok: 'https://evil@tiktok.com/a' } } };
  assert.deepEqual(themeNavigation(content), [{ label: 'Catálogo', to: '/productos' }]);
  assert.deepEqual(themeSocialLinks(content), [{ label: 'Instagram', url: 'https://www.instagram.com/merchant' }]);
});

test('white or black foreground has at least 4.5 contrast for representative brand colors', () => {
  const luminance = hex => {
    const rgb = hex.match(/[a-f0-9]{2}/gi).map(pair => parseInt(pair, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  for (const background of ['#c8f542', '#4a1429', '#181a18', '#ffffff', '#000000', '#777777', '#ff0000', '#00ff00', '#0000ff', '#203040']) {
    const a = luminance(background); const b = luminance(readableTextOn(background));
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, background);
  }
});

test('all original demos resolve released presentation, retain isolated data and existing URLs', () => {
  for (const template of ['classic', 'selecta', 'stride']) {
    assert.equal(templateDemoFromPath(`/_templates/${template}/productos`), template);
    const store = demoStore(template);
    assert.equal(store.themeRelease.renderer, template);
    assert.equal(store.tracking, null);
    assert.equal(store.whatsappPhone, null);
    assert.equal(demoResponse(template, '/orders'), null);
    const products = demoResponse(template, '/catalog');
    assert.ok(products.length > 0);
    assert.ok(demoResponse(template, `/products/${products[0].handle}`));
    assert.ok(storeHomeSections(store, store.themeRelease.defaultLayout.map(item => item.type)).length);
  }
  assert.equal(templateDemoFromPath('/_templates/not-registered/'), null);
  assert.equal(templateDemoFromPath('/_templates/classic-other/'), null);
});

test('a stable merchant identity can use another compiled presentation and its own composition', () => {
  const store = demoStore('classic');
  store.template = 'studio-local';
  store.themeRelease = { ...store.themeRelease, slug: 'studio-local', defaultLayout: [{ id: 'faq', type: 'faq' }, { id: 'hero', type: 'hero' }] };
  assert.deepEqual(storeHomeSections(store, ['hero', 'featured', 'faq']).map(item => item.id), ['faq', 'hero']);
  store.templateContent.layouts = { 'studio-local': [{ id: 'hero', type: 'hero', hidden: true }, { id: 'cta-a1b2c3', type: 'cta' }] };
  assert.deepEqual(storeHomeSections(store, ['hero', 'featured', 'faq']), [{ id: 'cta-a1b2c3', type: 'cta' }]);
  store.themeRelease.safeMode = true;
  assert.deepEqual(storeHomeSections(store, ['hero', 'featured', 'faq']).map(item => item.id), ['faq', 'hero']);
});
