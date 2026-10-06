import type { StoreTemplateTheme, StoreThemeCorners, StoreThemeFont, StorefrontView } from '@vendedoria/contracts';

/** Release defaults never replace persisted merchant overrides, including explicit empty values. */
export function storeTheme(store: StorefrontView): StoreTemplateTheme {
  return { ...store.themeRelease?.tokens, ...store.templateContent.theme };
}

/** Black or white text, whichever reads better on the given hex background. */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return '#ffffff';
  }
  const value = parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? '#000000' : '#ffffff';
}

const MANROPE = "'Manrope', system-ui, sans-serif";
const DEVICE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Body and title font stacks; only Manrope downloads a file, and the store already loads it. */
export const THEME_FONTS: Record<StoreThemeFont, { body: string; display: string }> = {
  modern: { body: MANROPE, display: MANROPE },
  editorial: { body: DEVICE, display: "Georgia, 'Times New Roman', serif" },
  simple: { body: DEVICE, display: DEVICE },
};

/** Control and card radius per corner style; `soft` keeps the store defaults. */
export const THEME_CORNERS: Record<StoreThemeCorners, { control: string; card: string } | null> = {
  square: { control: '2px', card: '4px' },
  soft: null,
  round: { control: '999px', card: '1.5rem' },
};

/** Brand values the store shows: the merchant theme over the store settings. */
export function storeBrand(store: StorefrontView): { primary: string; accent: string; logo: string | null } {
  const theme = storeTheme(store);
  return {
    primary: theme?.primary ?? store.brandColor,
    accent: theme?.accent ?? store.accentColor,
    logo: theme?.logo !== undefined ? theme.logo || null : store.logoUrl,
  };
}
