import type { ProductKind } from '@vendedoria/contracts';

export type KindTab = { param: string; kind: ProductKind; label: string; singular: string };

/** `?tipo=` values of the catalog; Spanish like the other catalog params. */
export const KIND_TABS: readonly KindTab[] = [
  { param: 'productos', kind: 'PRODUCT', label: 'Productos', singular: 'producto' },
  { param: 'servicios', kind: 'SERVICE', label: 'Servicios', singular: 'servicio' },
  { param: 'digitales', kind: 'DIGITAL', label: 'Digitales', singular: 'producto digital' },
];

export function kindTab(param: string | null | undefined): KindTab | null {
  return KIND_TABS.find((tab) => tab.param === param) ?? null;
}

/** Tabs worth showing: only when the store sells more than one kind. */
export function visibleKindTabs(kinds: readonly ProductKind[] | undefined): KindTab[] {
  const present = KIND_TABS.filter((tab) => kinds?.includes(tab.kind));
  return present.length > 1 ? present : [];
}

/** How the whole catalog is named: "servicios" for a store that only sells services. */
export function catalogNoun(kinds: readonly ProductKind[] | undefined): KindTab {
  const present = KIND_TABS.filter((tab) => kinds?.includes(tab.kind));
  return present.length === 1 ? present[0] : KIND_TABS[0];
}
