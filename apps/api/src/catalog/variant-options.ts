import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export type VariantOption = { name: string; value: string };
export type OptionRecord = {
  options?: Prisma.JsonValue | VariantOption[] | null;
  option1Name?: string | null; option1Value?: string | null;
  option2Name?: string | null; option2Value?: string | null;
  option3Name?: string | null; option3Value?: string | null;
};
export const MAX_VARIANTS = 500;
export const MAX_VARIANT_AXES = 5;
export const normalizeOption = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('es');

/** New pairs are authoritative, with a read fallback for unchanged legacy rows. */
export function variantOptions(record: OptionRecord): VariantOption[] {
  if (Array.isArray(record.options)) {
    return (record.options as unknown[]).filter((pair): pair is VariantOption =>
      !!pair && typeof pair === 'object' && !Array.isArray(pair) &&
      typeof (pair as VariantOption).name === 'string' && typeof (pair as VariantOption).value === 'string',
    ).map(({ name, value }) => ({ name: name.trim(), value: value.trim() }));
  }
  return [
    [record.option1Name, record.option1Value],
    [record.option2Name, record.option2Value],
    [record.option3Name, record.option3Value],
  ].filter((pair): pair is [string | null | undefined, string] => Boolean(pair[1]))
    .map(([name, value]) => ({ name: name?.trim() || 'Opción', value: value.trim() }));
}

export function combinationKey(options: VariantOption[]): string {
  const canonical = JSON.stringify(options.map(({ name, value }) => [normalizeOption(name), normalizeOption(value)])
    .sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(canonical).digest('hex');
}
