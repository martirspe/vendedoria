import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PublicCatalogFacets,
  PublicCatalogSelection,
} from '@vendedoria/contracts';

const DETAIL_LABELS: Record<string, string> = {
  size: 'Presentación',
  family: 'Familia',
  intensity: 'Intensidad',
  digitalFormat: 'Formato',
};

export function parseCatalogFilters(raw?: string): PublicCatalogSelection[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidFilters();
  }
  if (!Array.isArray(parsed) || parsed.length > 20) throw invalidFilters();
  const keys = new Set<string>();
  return parsed.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw invalidFilters();
    const { key, values } = entry as Record<string, unknown>;
    if (
      typeof key !== 'string' ||
      key.length > 100 ||
      keys.has(key) ||
      !(
        key === 'brand' ||
        key === 'benefit' ||
        /^variant:.+/.test(key) ||
        /^attribute:.+/.test(key) ||
        (key.startsWith('detail:') &&
          Object.hasOwn(DETAIL_LABELS, key.slice(7)))
      ) ||
      !Array.isArray(values) ||
      !values.length ||
      values.length > 30 ||
      values.some(
        (value) =>
          typeof value !== 'string' || !value.trim() || value.length > 400,
      )
    ) {
      throw invalidFilters();
    }
    keys.add(key);
    return { key, values: [...new Set(values as string[])] };
  });
}

function invalidFilters(): BadRequestException {
  return new BadRequestException(
    'Revisa los filtros del catálogo e inténtalo de nuevo.',
  );
}

/** These values are bound, including JSON names and category prefixes. */
export function catalogFilterSql(
  filters: PublicCatalogSelection[],
  category?: string,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (category) {
    const path = category
      .split(/\s*[>/]\s*/)
      .map((part) => part.trim())
      .join(' > ');
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM unnest(p.categories) c
      WHERE regexp_replace(trim(c), '[[:space:]]*[>/][[:space:]]*', ' > ', 'g') = ${path}
        OR starts_with(regexp_replace(trim(c), '[[:space:]]*[>/][[:space:]]*', ' > ', 'g'), ${path + ' > '}))`);
  }
  const variants: Prisma.Sql[] = [];
  for (const { key, values } of filters) {
    const choices = Prisma.join(values);
    if (key === 'brand')
      conditions.push(Prisma.sql`trim(p.brand) IN (${choices})`);
    else if (key.startsWith('variant:')) {
      const name = key.slice(8);
      variants.push(Prisma.sql`EXISTS (SELECT 1 FROM (VALUES
        (v."option1Name", v."option1Value"), (v."option2Name", v."option2Value"),
        (v."option3Name", v."option3Value")) o(name, value)
        WHERE trim(o.name) = ${name} AND trim(o.value) IN (${choices}))`);
    } else if (key.startsWith('attribute:')) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.details->'attributes') = 'array' THEN p.details->'attributes' ELSE '[]'::jsonb END) a
        WHERE jsonb_typeof(a->'name') = 'string' AND jsonb_typeof(a->'value') = 'string'
          AND trim(a->>'name') = ${key.slice(10)} AND trim(a->>'value') IN (${choices}))`);
    } else if (key === 'benefit') {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.details->'benefits') = 'array' THEN p.details->'benefits' ELSE '[]'::jsonb END) b
        WHERE jsonb_typeof(b) = 'string' AND trim(b #>> '{}') IN (${choices}))`);
    } else {
      conditions.push(
        Prisma.sql`trim(p.details->>${key.slice(7)}) IN (${choices})`,
      );
    }
  }
  // Size and color must coexist on one variant, rather than on two different options.
  if (variants.length)
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" v
    WHERE v."productId" = p.id AND ${Prisma.join(variants, ' AND ')})`);
  return conditions.length
    ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;
}

/** Same minimum variant price displayed by the public mapper. */
export const catalogPriceSql = Prisma.sql`COALESCE(
  (SELECT min(v."priceCents") FROM "ProductVariant" v WHERE v."productId" = p.id), p."basePriceCents")`;

type FacetRow = { key: string; value: string; count: number };
type PriceRow = { currency: string; minCents: number; maxCents: number };
type FacetDb = { $queryRaw: <T>(query: Prisma.Sql) => Promise<T> };

/** Aggregate the complete published search/type collection without transferring product sheets. */
export async function loadCatalogFacets(
  db: FacetDb,
  where: Prisma.Sql,
): Promise<PublicCatalogFacets> {
  const [rows, prices] = await Promise.all([
    db.$queryRaw<FacetRow[]>(Prisma.sql`
      WITH base AS (SELECT p.id, p.categories, p.brand, p.details FROM "Product" p WHERE ${where}),
      facet_values AS (
        SELECT b.id, 'category' AS key, array_to_string(parts.path[1:depth.n], ' > ') AS value
          FROM base b CROSS JOIN LATERAL unnest(b.categories) c
          CROSS JOIN LATERAL (SELECT regexp_split_to_array(trim(c), '[[:space:]]*[>/][[:space:]]*') AS path) parts
          CROSS JOIN LATERAL generate_subscripts(parts.path, 1) depth(n)
        UNION ALL SELECT id, 'brand', trim(brand) FROM base
        UNION ALL SELECT b.id, 'variant:' || trim(o.name), trim(o.value)
          FROM base b JOIN "ProductVariant" v ON v."productId" = b.id
          CROSS JOIN LATERAL (VALUES (v."option1Name", v."option1Value"),
            (v."option2Name", v."option2Value"), (v."option3Name", v."option3Value")) o(name, value)
          WHERE trim(o.name) <> ''
        UNION ALL SELECT b.id, 'attribute:' || trim(a->>'name'), trim(a->>'value') FROM base b
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.details->'attributes') = 'array'
            THEN b.details->'attributes' ELSE '[]'::jsonb END) a
          WHERE jsonb_typeof(a->'name') = 'string' AND jsonb_typeof(a->'value') = 'string' AND trim(a->>'name') <> ''
        UNION ALL SELECT b.id, 'benefit', trim(benefit #>> '{}') FROM base b
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.details->'benefits') = 'array'
            THEN b.details->'benefits' ELSE '[]'::jsonb END) benefit WHERE jsonb_typeof(benefit) = 'string'
        UNION ALL SELECT b.id, 'detail:' || d.key, trim(b.details->>d.key) FROM base b
          CROSS JOIN (VALUES ('size'), ('family'), ('intensity'), ('digitalFormat')) d(key)
          WHERE jsonb_typeof(b.details->d.key) = 'string'
      ) SELECT key, value, count(DISTINCT id)::int AS count FROM facet_values
        WHERE value <> '' AND length(key) <= 100 AND length(value) <= 400 GROUP BY key, value ORDER BY key, value`),
    db.$queryRaw<
      PriceRow[]
    >(Prisma.sql`SELECT p.currency, min(${catalogPriceSql})::int AS "minCents",
      max(${catalogPriceSql})::int AS "maxCents" FROM "Product" p WHERE ${where} GROUP BY p.currency`),
  ]);
  const groups = new Map<string, PublicCatalogFacets['groups'][number]>();
  for (const row of rows) {
    if (row.key === 'category') continue;
    const group = groups.get(row.key) ?? {
      key: row.key,
      label:
        row.key === 'brand'
          ? 'Marca'
          : row.key === 'benefit'
            ? 'Beneficio'
            : row.key.startsWith('detail:')
              ? DETAIL_LABELS[row.key.slice(7)]
              : row.key.split(':').slice(1).join(':'),
      values: [],
    };
    group.values.push({ value: row.value, count: row.count });
    groups.set(row.key, group);
  }
  return {
    categories: rows
      .filter((row) => row.key === 'category')
      .map(({ value, count }) => ({ value, count })),
    groups: [...groups.values()],
    price: prices.length === 1 ? prices[0] : null,
  };
}
