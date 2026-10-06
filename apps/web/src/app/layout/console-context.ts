import type { DsIconName } from '@vendedoria/ui';

export type ContextLink = { label: string; path: string; icon: DsIconName; section?: string };
export type ConsoleContext = { id: 'store' | 'settings'; label: string; groups: { label: string; items: ContextLink[] }[] };
export const STORE_SECTIONS = [
  { label: 'Temas', section: 'temas', icon: 'palette' },
  { label: 'Identidad y contacto', section: 'identidad', icon: 'store' },
  { label: 'Preferencias', section: 'preferencias', icon: 'settings' },
  { label: 'Datos legales', section: 'legal', icon: 'fileText' },
  { label: 'Automatizaciones', section: 'automatizaciones', icon: 'sparkles' },
] satisfies { label: string; section: string; icon: DsIconName }[];
export const CONSOLE_CONTEXTS: ConsoleContext[] = [
  { id: 'store', label: 'Tienda web', groups: [
    { label: 'Diseño y contenido', items: STORE_SECTIONS.map(item => ({ ...item, path: '/app/store' })) },
    { label: 'Presencia online', items: [
      { label: 'Dominio propio', path: '/app/domain', icon: 'globe' },
      { label: 'Analítica de la tienda', path: '/app/tracking', icon: 'chartColumn' },
    ] },
  ] },
  { id: 'settings', label: 'Ajustes', groups: [
    { label: 'Tu negocio', items: [
      { label: 'General', path: '/app/settings', icon: 'store' },
      { label: 'Equipo', path: '/app/team', icon: 'users' },
    ] },
  ] },
];

export function contextForUrl(url: string): ConsoleContext | undefined {
  const path = url.split(/[?#]/)[0];
  return CONSOLE_CONTEXTS.find(context => context.groups.some(group => group.items.some(item => item.path === path)));
}
export function isContextLinkActive(item: ContextLink, url: string): boolean {
  const [path, query] = url.split('?');
  return item.path === path.split('#')[0] && (!item.section || item.section === (new URLSearchParams(query).get('seccion') || 'temas'));
}
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}
