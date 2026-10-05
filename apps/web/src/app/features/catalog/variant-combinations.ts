export type OptionPair = { name: string; value: string };
export type VariantAxis = { name: string; values: string };
export type CombinationDraft = {
  expectedStockQty?: number | null;
  id?: string; sku: string; options: OptionPair[]; imageUrl: string | null;
  price: number; priceInherited: boolean; isAvailable: boolean; stockQty: number | null;
};
const normalize = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('es');
export const keyOf = (pairs: OptionPair[]) => JSON.stringify(pairs.map((pair) => [normalize(pair.name), normalize(pair.value)]).sort(([a], [b]) => a.localeCompare(b)));

export function readOptions(variant: { options?: OptionPair[] | null; option1Name?: string | null; option1Value?: string | null; option2Name?: string | null; option2Value?: string | null; option3Name?: string | null; option3Value?: string | null }): OptionPair[] {
  if (variant.options) return variant.options.map((pair) => ({ ...pair }));
  return [[variant.option1Name, variant.option1Value], [variant.option2Name, variant.option2Value], [variant.option3Name, variant.option3Value]]
    .filter((pair): pair is [string | null | undefined, string] => Boolean(pair[1]))
    .map(([name, value]) => ({ name: name?.trim() || 'Opción', value }));
}

/** Bound before materializing the Cartesian product. Existing combinations keep their identity and edits. */
export function generateCombinations(axes: VariantAxis[], existing: CombinationDraft[], price: number, skuPrefix: string): CombinationDraft[] {
  if (!axes.length || axes.length > 5) throw new Error('Define entre uno y cinco atributos.');
  const names = axes.map((axis) => axis.name.trim());
  if (names.some((name) => !name || name.length > 60) || new Set(names.map(normalize)).size !== names.length)
    throw new Error('Los atributos necesitan nombres distintos, de hasta 60 caracteres.');
  const values = axes.map((axis) => axis.values.split(/[\n,]/).map((value) => value.trim()).filter(Boolean));
  if (values.some((list) => !list.length || list.length > 50 || list.some((value) => value.length > 200) || new Set(list.map(normalize)).size !== list.length))
    throw new Error('Completa cada atributo con valores distintos, hasta 50 por atributo.');
  if (values.reduce((count, list) => count * list.length, 1) > 500) throw new Error('Máximo 500 combinaciones. Reduce los valores antes de generar.');
  const saved = new Map(existing.map((variant) => [keyOf(variant.options), variant]));
  let combinations: OptionPair[][] = [[]];
  values.forEach((list, index) => { combinations = combinations.flatMap((pairs) => list.map((value) => [...pairs, { name: names[index], value }])); });
  const usedSkus = new Set(existing.map((variant) => normalize(variant.sku)).filter(Boolean));
  return combinations.map((options, index) => {
    const previous = saved.get(keyOf(options));
    if (previous) return { ...previous, options };
    let suffix = index + 1;
    let sku = skuPrefix ? `${skuPrefix.slice(0, 50)}-${suffix}` : '';
    while (sku && usedSkus.has(normalize(sku))) sku = `${skuPrefix.slice(0, 50)}-${++suffix}`;
    if (sku) usedSkus.add(normalize(sku));
    return { options, sku, imageUrl: null, price, priceInherited: true, isAvailable: true, stockQty: 0 };
  });
}
