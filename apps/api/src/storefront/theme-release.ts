import { BadRequestException } from '@nestjs/common';
import type { Storefront } from '@prisma/client';
import { compatibility, getTheme, type ThemeManifest, type ThemeCompatibility } from '@vendedoria/themes';
import type { StoreThemeRelease } from '@vendedoria/contracts';

export type ThemeSelection = { template: string; version: string };
export type ThemeStatus = {
  active: ThemeSelection;
  editing: ThemeSelection;
  activeCompatibility: ThemeCompatibility;
  compatibility: ThemeCompatibility;
  update: { version: string; required: boolean; changelog: string[] } | null;
};

export function selection(store: Storefront, preview = false): ThemeSelection {
  return preview && store.themeDraftTemplate && store.themeDraftVersion
    ? { template: store.themeDraftTemplate, version: store.themeDraftVersion }
    : { template: store.template, version: store.themeVersion };
}

export function assertTheme(slug: string, version: string, industry: string): ThemeManifest {
  const theme = getTheme(slug, version);
  if (!theme) throw new BadRequestException('Esa versión de la plantilla no está disponible.');
  const result = compatibility(theme);
  if (result.status === 'incompatible' || result.status === 'update_required') {
    throw new BadRequestException(result.issues.map(issue => issue.message).join(' '));
  }
  if (theme.industries !== 'all' && !theme.industries.includes(industry)) {
    throw new BadRequestException('Esa plantilla no está disponible para el rubro de tu negocio.');
  }
  return theme;
}

export function assertContentVersion(value: unknown): void {
  if (value && typeof value === 'object' && 'version' in value && value.version !== 1) {
    throw new BadRequestException('Esta versión del contenido necesita otra versión del editor. No se guardaron cambios.');
  }
}

export function themeStatus(store: Storefront): ThemeStatus {
  const active = selection(store);
  const editing = selection(store, true);
  const activeCompatibility = storeCompatibility(active, store.industry);
  const result = storeCompatibility(editing, store.industry);
  const latest = getTheme(active.template);
  return {
    active, editing, activeCompatibility, compatibility: result,
    update: latest && latest.version !== active.version ? {
      version: latest.version,
      required: ['incompatible', 'update_required'].includes(activeCompatibility.status),
      changelog: latest.changelog,
    } : null,
  };
}

function storeCompatibility(chosen: ThemeSelection, industry: string): ThemeCompatibility {
  const theme = getTheme(chosen.template, chosen.version);
  const result = compatibility(theme);
  if (theme && theme.industries !== 'all' && !theme.industries.includes(industry)) {
    return { status: 'incompatible', issues: [...result.issues, { code: 'industry', path: 'industries', message: 'La plantilla no corresponde al rubro actual. Elige una compatible y publica el diseño.' }] };
  }
  return result;
}

/** The buyer never needs the entire manifest. An unavailable release falls back without rewriting data. */
export function publicTheme(store: Storefront, preview: boolean): StoreThemeRelease {
  const chosen = selection(store, preview);
  const manifest = getTheme(chosen.template, chosen.version);
  const result = compatibility(manifest);
  const safeMode = !manifest || ['incompatible', 'update_required'].includes(result.status) ||
    manifest.industries !== 'all' && !manifest.industries.includes(store.industry);
  const resolved = safeMode ? getTheme('classic', '1.0.0')! : manifest!;
  const renderer = resolved.renderer.split('@')[0] as StoreThemeRelease['renderer'];
  return {
    id: manifest?.id ?? chosen.template, slug: chosen.template, version: chosen.version, renderer, safeMode,
    tokens: resolved.tokens,
    defaultLayout: resolved.presets[0].layout,
  };
}
