import type { StoreTemplateContent } from '@vendedoria/contracts';

const DESTINATIONS = ['/', '/productos', '/carrito', '/legal'];
/** Undefined means original navigation. Explicit labels create a bounded custom menu. */
export function themeNavigation(content: StoreTemplateContent): { label: string; to: string }[] | null {
  const fields = content.sections['navigation'];
  if (!fields || ![1, 2, 3].some(n => fields[`label${n}`] !== undefined)) return null;
  return [1, 2, 3].flatMap(n => {
    const label = fields[`label${n}`]?.trim();
    const to = fields[`destination${n}`] || '/productos';
    return label && DESTINATIONS.includes(to) ? [{ label, to }] : [];
  });
}

export function themeSocialLinks(content: StoreTemplateContent): { label: string; url: string }[] {
  const labels = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
  return Object.entries(labels).flatMap(([key, label]) => {
    const value = content.sections['social']?.[key];
    try {
      const url = new URL(value || '');
      const expected = `${key}.com`;
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && [expected, `www.${expected}`].includes(url.hostname)
        ? [{ label, url: url.href }] : [];
    } catch { return []; }
  });
}
