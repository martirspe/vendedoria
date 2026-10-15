import { DOCUMENT, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { MARKETING_PLANS } from './marketing-content';

/** Public marketing origin documented in docs/DEPLOY.md; auth redirects to the console. */
export const MARKETING_ORIGIN = 'https://marrso.com';
export const MARKETING_TITLE = 'VendedorIA | Tu vendedor IA en WhatsApp e Instagram';
export const MARKETING_DESCRIPTION =
  'Convierte conversaciones en pedidos con tu vendedor IA en WhatsApp e Instagram. Catálogo, cobros y tienda web en un solo lugar. Prueba 14 días sin tarjeta.';

/** Runs in the Angular injection context and also during prerendering. */
export function installMarketingSeo(): () => void {
  const document = inject(DOCUMENT);
  const meta = inject(Meta);
  const title = inject(Title);
  const previousTitle = title.getTitle();
  const previousDescription = meta.getTag('name="description"')?.content ?? '';
  title.setTitle(MARKETING_TITLE);
  meta.updateTag({ name: 'description', content: MARKETING_DESCRIPTION });
  const tags = meta.addTags([
    { property: 'og:type', content: 'website' },
    { property: 'og:locale', content: 'es_PE' },
    { property: 'og:site_name', content: 'VendedorIA' },
    { property: 'og:title', content: MARKETING_TITLE },
    { property: 'og:description', content: MARKETING_DESCRIPTION },
    { property: 'og:url', content: `${MARKETING_ORIGIN}/` },
    { property: 'og:image', content: `${MARKETING_ORIGIN}/marketing/social-card.png` },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    {
      property: 'og:image:alt',
      content: 'VendedorIA. Del hola al pago. Tu vendedor IA en WhatsApp e Instagram.',
    },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: MARKETING_TITLE },
    { name: 'twitter:description', content: MARKETING_DESCRIPTION },
    { name: 'twitter:image', content: `${MARKETING_ORIGIN}/marketing/social-card.png` },
  ]);
  const canonical =
    document.querySelector<HTMLLinkElement>('link[data-marketing-canonical]') ??
    document.createElement('link');
  canonical.setAttribute('data-marketing-canonical', '');
  canonical.rel = 'canonical';
  canonical.href = `${MARKETING_ORIGIN}/`;
  document.head.appendChild(canonical);
  const schema =
    document.querySelector<HTMLScriptElement>('script[data-marketing-schema]') ??
    document.createElement('script');
  schema.setAttribute('data-marketing-schema', '');
  schema.type = 'application/ld+json';
  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'VendedorIA',
    url: `${MARKETING_ORIGIN}/`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: MARKETING_DESCRIPTION,
    offers: MARKETING_PLANS.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: plan.price,
      priceCurrency: 'PEN',
      url: `${MARKETING_ORIGIN}/#planes`,
    })),
  });
  document.head.appendChild(schema);
  return () => {
    canonical.remove();
    schema.remove();
    tags.forEach((tag) => meta.removeTagElement(tag));
    title.setTitle(previousTitle);
    meta.updateTag({ name: 'description', content: previousDescription });
  };
}
