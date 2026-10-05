import type { PublicCatalogSelection } from "@vendedoria/contracts";

/** Invalid deep links fall back to an unfiltered discovery collection. */
export function catalogSelections(
  raw: string | undefined | null,
): PublicCatalogSelection[] {
  if (!raw || raw.length > 6000) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 20) return [];
    const keys = new Set<string>();
    return parsed.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const { key, values } = entry as Record<string, unknown>;
      if (
        typeof key !== "string" ||
        key.length > 100 ||
        keys.has(key) ||
        !/^(brand|benefit|variant:.+|attribute:.+|detail:(size|family|intensity|digitalFormat))$/.test(
          key,
        ) ||
        !Array.isArray(values) ||
        !values.length ||
        values.length > 30 ||
        !values.every(
          (value): value is string =>
            typeof value === "string" && !!value.trim() && value.length <= 400,
        )
      )
        return [];
      keys.add(key);
      return [{ key, values: [...new Set(values)] }];
    });
  } catch {
    return [];
  }
}

export function catalogPriceCents(
  raw: string | undefined | null,
): number | null {
  if (!raw || !/^\d{1,8}(\.\d{1,2})?$/.test(raw)) return null;
  const cents = Math.round(Number(raw) * 100);
  return cents <= 2147483647 ? cents : null;
}
