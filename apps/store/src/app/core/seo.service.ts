import { DOCUMENT, Injectable, REQUEST_CONTEXT, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { StoreRequestContext } from './store-context';
import { StoreStateService } from './store-state.service';
import { storeBrand } from './theme';
import { TemplateDemo } from './template-demo';

export type SeoInput = {
  title: string;
  description?: string | null;
  path: string;
  image?: string | null;
  type?: 'website' | 'product';
  jsonLd?: Record<string, unknown> | null;
  noindex?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly demo = inject(TemplateDemo);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly state = inject(StoreStateService);
  private readonly context = inject(REQUEST_CONTEXT, {
    optional: true,
  }) as StoreRequestContext | null;

  origin(): string {
    return this.context?.origin ?? this.document.location?.origin ?? '';
  }

  absolute(path: string): string {
    return new URL(path, this.origin()).toString();
  }

  set(input: SeoInput): void {
    const store = this.state.store();
    const storeName = store?.displayName ?? 'Tienda';
    const fullTitle = input.title === storeName ? storeName : `${input.title} | ${storeName}`;
    const description =
      input.description?.trim() || store?.seoDescription || store?.tagline || storeName;
    const url = this.absolute(input.path);
    const image = input.image ?? store?.heroImageUrl ?? (store ? storeBrand(store).logo : null);

    this.title.setTitle(fullTitle);
    this.tag('name', 'description', description.slice(0, 160));
    this.tag(
      'name',
      'robots',
      this.demo.active || store?.isPreview || input.noindex ? 'noindex, nofollow' : 'index, follow',
    );
    this.tag('property', 'og:title', fullTitle);
    this.tag('property', 'og:description', description.slice(0, 200));
    this.tag('property', 'og:url', url);
    this.tag('property', 'og:type', input.type === 'product' ? 'product' : 'website');
    this.tag('property', 'og:site_name', storeName);
    this.tag('property', 'og:locale', this.state.locale().replace('-', '_'));
    this.tag('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    if (image) {
      this.tag('property', 'og:image', image);
    } else {
      this.meta.removeTag("property='og:image'");
    }
    this.canonical(url);
    this.jsonLd(input.jsonLd ?? null);
    this.preconnect(image);
  }

  /** Photos come from the media CDN (CloudFront): open that connection before the hero image is parsed. */
  private preconnect(image: string | null): void {
    let origin: string;
    try {
      origin = image ? new URL(image).origin : '';
    } catch {
      return;
    }
    if (!origin.startsWith('https://') || origin === this.origin()) return;
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="preconnect"][data-media]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'preconnect';
      link.setAttribute('data-media', '');
      this.document.head.appendChild(link);
    }
    link.href = origin;
  }

  private tag(attr: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attr]: key, content }, `${attr}='${key}'`);
  }

  private canonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }

  private jsonLd(data: Record<string, unknown> | null): void {
    const id = 'store-jsonld';
    this.document.getElementById(id)?.remove();
    if (!data) {
      return;
    }
    const script = this.document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }
}
