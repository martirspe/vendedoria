import { Prisma, ProductKind } from '@prisma/client';

/** Bound transferred rows, not the number of products eligible for a search. */
export const CATALOG_CANDIDATES = 12;

type SearchDb = { $queryRaw: <T>(query: Prisma.Sql) => Promise<T> };
type SearchOptions = {
  published?: boolean;
  available?: boolean;
  category?: string;
  kind?: ProductKind;
  maxPriceCents?: number;
};

/** This expression must match the immutable expression indexed by the migration. */
export const catalogDocument = Prisma.sql`catalog_search_document(
  p.name, p.brand, p.line, p.categories, p."descriptionShort", p."descriptionFull", p.details)`;

export function catalogSearchWhere(tenantId: string, tokens: string[], options: SearchOptions = {}) {
  const words = tokens.slice(0, 12).map((word) => word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '').slice(0, 50)).filter(Boolean);
  // Values are always bound parameters; tsquery syntax never comes from user input.
  const query = Prisma.sql`to_tsquery('spanish', ${words.map((word) => `${word}:*`).join(' | ') || 'vendedoriaemptyquery'})`;
  const where = Prisma.sql`p."tenantId" = ${tenantId}
    AND ${catalogDocument} @@ ${query}
    ${options.available ? Prisma.sql`AND p."isAvailable" = true` : Prisma.empty}
    ${options.published ? Prisma.sql`AND p."isPublishedOnStore" = true` : Prisma.empty}
    ${options.category ? Prisma.sql`AND ${options.category} = ANY(p.categories)` : Prisma.empty}
    ${options.kind ? Prisma.sql`AND p.kind = ${options.kind}::"ProductKind"` : Prisma.empty}
    ${options.maxPriceCents !== undefined ? Prisma.sql`AND (
      (NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)
        AND p."basePriceCents" <= ${options.maxPriceCents})
      OR EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id
        AND v."isAvailable" = true AND (v."stockQty" IS NULL OR v."stockQty" > 0)
        AND v."priceCents" <= ${options.maxPriceCents}))` : Prisma.empty}`;
  return { where, query };
}

export async function searchCatalogIds(db: SearchDb, tenantId: string, tokens: string[], options: SearchOptions = {}) {
  if (!tokens.length) return [];
  const { where, query } = catalogSearchWhere(tenantId, tokens, options);
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p.id FROM "Product" p WHERE ${where}
    ORDER BY ts_rank_cd(${catalogDocument}, ${query}) DESC,
      p."sortOrder" ASC, p."updatedAt" DESC, p.id ASC
    LIMIT ${CATALOG_CANDIDATES}`);
  return rows.map((row) => row.id);
}

/** Only explicit maximum-price statements are hard filters; sizes and durations are not prices. */
export function maximumPrice(text: string): number | undefined {
  const match = text.toLowerCase().match(/(?:hasta|menos de|m[aá]ximo|presupuesto(?: de)?)\s*(?:s\/?\.?\s*|pen\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:soles|pen)?/);
  if (!match || /^\s*(?:ml|litros?|g|kg|cm|mm|minutos?|horas?|d[ií]as?|personas?|a[nñ]os?)\b/.test(text.slice((match.index ?? 0) + match[0].length))) return undefined;
  return Math.round(Number(match[1].replace(',', '.')) * 100);
}
