import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { afterEach, describe, expect, it } from 'vitest';
import { installMarketingSeo, MARKETING_ORIGIN, MARKETING_TITLE } from './marketing-seo';

afterEach(() => {
  document
    .querySelectorAll('[data-marketing-canonical], [data-marketing-schema]')
    .forEach((node) => node.remove());
  TestBed.resetTestingModule();
});
describe('Marketing metadata', () => {
  it('reuses prerendered canonical and structured data during hydration and releases them on navigation', () => {
    TestBed.configureTestingModule({ providers: [Meta, Title] });
    const title = TestBed.inject(Title);
    title.setTitle('Previous page');
    const canonical = document.createElement('link');
    canonical.setAttribute('data-marketing-canonical', '');
    canonical.rel = 'canonical';
    document.head.append(canonical);
    const schema = document.createElement('script');
    schema.setAttribute('data-marketing-schema', '');
    schema.type = 'application/ld+json';
    document.head.append(schema);
    const cleanup = TestBed.runInInjectionContext(() => installMarketingSeo());
    expect(document.querySelectorAll('link[data-marketing-canonical]')).toHaveLength(1);
    expect(document.querySelectorAll('script[data-marketing-schema]')).toHaveLength(1);
    expect(canonical.href).toBe(`${MARKETING_ORIGIN}/`);
    expect(title.getTitle()).toBe(MARKETING_TITLE);
    expect(
      JSON.parse(schema.textContent ?? '{}').offers.map((offer: { price: number }) => offer.price),
    ).toEqual([29, 79, 199, 549]);
    cleanup();
    expect(document.querySelector('link[data-marketing-canonical]')).toBeNull();
    expect(document.querySelector('script[data-marketing-schema]')).toBeNull();
    expect(TestBed.inject(Meta).getTag('property="og:url"')).toBeNull();
    expect(title.getTitle()).toBe('Previous page');
  });
});
