import { Prisma, ProductKind } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProductDetailsDto, ProductExtrasDto } from './dto/create-product.dto';
import { CARRIER_TIERS, MAX_CARRIER_RATE_CENTS } from '../storefront/shipping';
import {
  INDUSTRIES,
  TEMPLATES,
  templateAllowed,
} from '../storefront/store-templates';
import { findUbigeo } from '../ubigeo/ubigeo';

/**
 * Catalog package import: `catalog.json` plus the photos it references (`images/...`).
 * Parsing and planning are pure so the preview and the commit always agree; the service
 * only loads the tenant's current state and writes the plan.
 */

export const MAX_IMPORT_PRODUCTS = 2000;
export const MAX_IMPORT_IMAGES = 3000;
const MAX_MEDIA = 12;
const MAX_PRICE_CENTS = 100_000_000;
const MAX_STOCK = 100_000;
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export type ImportIssue = {
  level: 'error' | 'warning';
  handle: string | null;
  message: string;
};

export type ImportImage = {
  key: string;
  kind: 'image' | 'related';
  alt: string | null;
  caption: string | null;
};

export type ImportDetails = Partial<Omit<ProductDetailsDto, 'size'>> & {
  size: string | null;
  benefits: string[];
  usage: string[];
  notes: string[];
  highlights: string[];
  montage: boolean;
};

const IMPORT_DETAIL_KEYS = new Set<string>([
  'size',
  'benefits',
  'usage',
  'notes',
  'highlights',
  'montage',
]);

/** A re-import replaces the fields the package carries and keeps the ones written in the console. */
export function keepConsoleDetails(
  previous: Prisma.JsonValue | null | undefined,
  imported: Prisma.JsonObject,
): Prisma.JsonObject {
  const kept =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? Object.fromEntries(
          Object.entries(previous).filter(([key]) => !IMPORT_DETAIL_KEYS.has(key)),
        )
      : {};
  return { ...kept, ...imported } as Prisma.JsonObject;
}

export type ImportProduct = {
  kind?: ProductKind;
  durationMinutes?: number | null;
  serviceMode?: string | null;
  digitalAccessUrl?: string | null;
  digitalInstructions?: string | null;
  handle: string;
  name: string;
  descriptionShort: string | null;
  descriptionFull: string | null;
  categories: string[];
  brand: string | null;
  line: string | null;
  /** SKU of the stock this product carries; null for sets that consume their pieces. */
  sku: string | null;
  details: ImportDetails;
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  priceCents: number | null;
  active: boolean;
  /** Carries its own stock (simple product or closed set sold under its own SKU). */
  holdsStock: boolean;
  /** Units from the package inventory; null when the package does not list the SKU. */
  stockQty: number | null;
  images: ImportImage[];
  /** Pieces of a set, by handle of the product that carries each SKU. */
  pieces: { handle: string; quantity: number }[];
};

export type ImportStoreSettings = {
  industry: string | null;
  template: string | null;
  freeShippingFromCents: number | null;
  shippingOriginUbigeo: string | null;
  carrierRates: { olva?: number[]; shalom?: number[] } | null;
  heroImage: string | null;
  bannerImage: string | null;
};

export type ParsedCatalog = {
  source: string | null;
  products: ImportProduct[];
  store: ImportStoreSettings | null;
  issues: ImportIssue[];
};

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const clip = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const clips = (value: unknown, max = 400) =>
  Array.isArray(value)
    ? value
        .map((item) => clip(item, max))
        .filter((item): item is string => item !== null)
        .slice(0, 20)
    : [];
const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= max;

/**
 * Package-relative photo path ("item-1/foto-1.jpg") for a reference written as
 * "/images/products/…", "images/…" or a bare relative path. Remote URLs and paths that
 * try to leave the package are rejected (null).
 */
export function imageKey(reference: unknown): string | null {
  if (typeof reference !== 'string') return null;
  const path = reference.trim().replace(/\\/g, '/');
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//'))
    return null;
  const key = path
    .replace(/^\/+/, '')
    .replace(/^images\/products\//, '')
    .replace(/^images\//, '');
  if (
    !IMAGE_EXT.test(key) ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return null;
  return key.slice(0, 300);
}

export function parseCatalogPackage(text: string): ParsedCatalog {
  const issues: ImportIssue[] = [];
  const fail = (message: string): ParsedCatalog => ({
    source: null,
    products: [],
    store: null,
    issues: [{ level: 'error', handle: null, message }],
  });

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return fail('El archivo catalog.json no es un JSON válido.');
  }
  if (!isObject(root) || !Array.isArray(root['products'])) {
    return fail('El archivo catalog.json debe tener una lista "products".');
  }
  const rawProducts = root['products'];
  if (!rawProducts.length) return fail('El archivo no trae productos.');
  if (rawProducts.length > MAX_IMPORT_PRODUCTS) {
    return fail(
      `El archivo trae ${rawProducts.length} productos; el máximo por importación es ${MAX_IMPORT_PRODUCTS}.`,
    );
  }

  const stockOf = new Map<string, number>();
  const inventory: unknown[] = Array.isArray(root['inventory'])
    ? root['inventory']
    : [];
  for (const row of inventory.filter(isObject)) {
    const sku = clip(row['sku'], 60);
    if (!sku) continue;
    if (!isCount(row['stock'], MAX_STOCK)) {
      issues.push({
        level: 'warning',
        handle: null,
        message: `El stock del SKU ${sku} no es un número válido; se ignora.`,
      });
      continue;
    }
    stockOf.set(sku, row['stock']);
  }

  type Entry = {
    raw: Raw;
    content: Raw;
    handle: string;
    isSet: boolean;
    singleSku: string | null;
  };
  const entries: Entry[] = [];
  const seen = new Set<string>();
  rawProducts.forEach((item, index) => {
    const position = `Producto ${index + 1}`;
    if (!isObject(item)) {
      issues.push({
        level: 'error',
        handle: null,
        message: `${position}: formato no válido.`,
      });
      return;
    }
    const handle = typeof item['slug'] === 'string' ? item['slug'].trim() : '';
    if (!HANDLE.test(handle) || handle.length > 120) {
      issues.push({
        level: 'error',
        handle: handle || null,
        message: `${position}: el enlace "${handle}" debe tener solo minúsculas, números y guiones.`,
      });
      return;
    }
    if (seen.has(handle)) {
      issues.push({
        level: 'error',
        handle,
        message: `El enlace "${handle}" está repetido en el archivo.`,
      });
      return;
    }
    seen.add(handle);
    const content = isObject(item['content']) ? item['content'] : {};
    const stock = Array.isArray(content['inventory'])
      ? content['inventory'].filter(isObject)
      : [];
    const singleSku =
      stock.length === 1 && stock[0]['quantity'] === 1
        ? clip(stock[0]['sku'], 60)
        : null;
    entries.push({
      raw: item,
      content,
      handle,
      isSet: content['format'] === 'set',
      singleSku,
    });
  });

  // Each SKU belongs to one product that carries its stock: the individual product, or a
  // closed set sold under its own SKU. Other sets consume the stock of those products.
  const owner = new Map<string, string>();
  for (const e of entries)
    if (!e.isSet && e.singleSku) owner.set(e.singleSku, e.handle);
  for (const e of entries)
    if (e.isSet && e.singleSku && !owner.has(e.singleSku))
      owner.set(e.singleSku, e.handle);
  const holds = (e: Entry) =>
    !e.isSet || (e.singleSku !== null && owner.get(e.singleSku) === e.handle);

  const products: ImportProduct[] = [];
  entries.forEach((e, index) => {
    const { raw, content, handle } = e;
    const name = clip(raw['name'], 250);
    if (!name || name.length < 2) {
      issues.push({
        level: 'error',
        handle,
        message: `"${handle}": falta el nombre.`,
      });
      return;
    }
    const price = raw['priceCents'];
    const extrasInput = Object.fromEntries(['kind', 'durationMinutes', 'serviceMode', 'digitalAccessUrl', 'digitalInstructions']
      .filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]]));
    const extras = plainToInstance(ProductExtrasDto, extrasInput);
    const detailInput = content['details'] ?? {};
    const extendedDetails = plainToInstance(ProductDetailsDto, isObject(detailInput) ? detailInput : {});
    if (validateSync(extras, { whitelist: true, forbidNonWhitelisted: true }).length ||
      !isObject(detailInput) || validateSync(extendedDetails, { whitelist: true, forbidNonWhitelisted: true }).length) {
      issues.push({ level: 'error', handle, message: `"${name}": revisa el tipo y los campos de la ficha.` });
      return;
    }
    const stockless = extras.kind === 'DIGITAL' || extras.kind === 'SERVICE';
    if (stockless && e.isSet) {
      issues.push({ level: 'error', handle, message: `"${name}": servicios y digitales no pueden ser sets.` });
      return;
    }
    if (extras.kind === 'DIGITAL' && !extras.digitalAccessUrl?.trim()) {
      issues.push({ level: 'error', handle, message: `"${name}": falta el enlace HTTPS de acceso digital.` });
      return;
    }
    if (
      price !== null &&
      price !== undefined &&
      !isCount(price, MAX_PRICE_CENTS)
    ) {
      issues.push({
        level: 'error',
        handle,
        message: `"${name}": el precio debe ser un entero en céntimos.`,
      });
      return;
    }
    const holder = stockless || holds(e);
    const pieces: ImportProduct['pieces'] = [];
    if (!holder) {
      const stock = Array.isArray(content['inventory'])
        ? content['inventory'].filter(isObject)
        : [];
      let broken = false;
      for (const row of stock) {
        const sku = clip(row['sku'], 60);
        const piece = sku ? owner.get(sku) : undefined;
        if (!piece) {
          issues.push({
            level: 'error',
            handle,
            message: `"${name}": ningún producto del archivo lleva el SKU ${sku ?? '(vacío)'}.`,
          });
          broken = true;
          continue;
        }
        const quantity =
          isCount(row['quantity'], 20) && row['quantity'] >= 1
            ? row['quantity']
            : 1;
        const existing = pieces.find((p) => p.handle === piece);
        if (existing)
          existing.quantity = Math.min(20, existing.quantity + quantity);
        else pieces.push({ handle: piece, quantity });
      }
      if (broken) return;
      if (!pieces.length) {
        issues.push({
          level: 'error',
          handle,
          message: `"${name}": es un set sin piezas.`,
        });
        return;
      }
    }

    const includes = Array.isArray(content['includes'])
      ? content['includes'].filter(isObject)
      : [];
    const single = !e.isSet || (holder && includes.length <= 1);
    const images: ImportImage[] = [];
    let remote = 0;
    for (const image of Array.isArray(content['images'])
      ? content['images'].filter(isObject)
      : []) {
      const key = imageKey(image['url']);
      if (!key) {
        remote += 1;
        continue;
      }
      if (images.length >= MAX_MEDIA || images.some((item) => item.key === key))
        continue;
      images.push({
        key,
        kind: image['kind'] === 'related' ? 'related' : 'image',
        alt: clip(image['alt'], 160),
        caption: clip(image['caption'], 200),
      });
    }
    if (remote) {
      issues.push({
        level: 'warning',
        handle,
        message: `"${name}": ${remote} ${remote === 1 ? 'foto no está' : 'fotos no están'} dentro del paquete y se omiten.`,
      });
    }

    const sku = holder ? e.singleSku : null;
    const categories = Array.isArray(raw['categories'])
      ? clips(raw['categories'], 60).slice(0, 12)
      : [clip(raw['category'], 60)].filter(
          (value): value is string => value !== null,
        );
    products.push({
      ...extrasInput,
      handle,
      name,
      descriptionShort: clip(content['summary'], 300),
      descriptionFull: clip(content['description'], 5000),
      categories,
      brand: clip(content['brand'], 60),
      line: clip(content['line'], 80),
      sku,
      details: {
        size: single ? clip(includes[0]?.['size'], 60) : null,
        benefits: clips(content['benefits']),
        usage: clips(content['usage']),
        notes: clips(content['notes']),
        highlights: single
          ? clips(includes[0]?.['details'])
          : clips(
              includes.map((piece) =>
                [clip(piece['name'], 200), clip(piece['size'], 60)]
                  .filter(Boolean)
                  .join(' · '),
              ),
            ),
        montage: content['montage'] === true,
        ...(JSON.parse(JSON.stringify(extendedDetails)) as ProductDetailsDto),
      },
      seoTitle: clip(content['title'], 70) ?? name.slice(0, 70),
      seoDescription: clip(content['summary'], 160),
      sortOrder: Math.min(index, 9999),
      priceCents: typeof price === 'number' ? price : null,
      active: raw['active'] !== false,
      holdsStock: !stockless && holder,
      stockQty: holder && sku !== null ? (stockOf.get(sku) ?? null) : null,
      images,
      pieces,
    });
  });

  return {
    source: clip(root['source'], 160),
    products,
    store: isObject(root['store']) ? parseStore(root['store'], issues) : null,
    issues,
  };
}

function parseStore(raw: Raw, issues: ImportIssue[]): ImportStoreSettings {
  const warn = (message: string) =>
    issues.push({ level: 'warning', handle: null, message });
  const industry = clip(raw['industry'], 40);
  const template = clip(raw['template'], 40);
  const store: ImportStoreSettings = {
    industry: null,
    template: null,
    freeShippingFromCents: null,
    shippingOriginUbigeo: null,
    carrierRates: null,
    heroImage: imageKey(raw['heroImage']),
    bannerImage: imageKey(raw['bannerImage']),
  };
  if (industry) {
    if ((INDUSTRIES as readonly string[]).includes(industry))
      store.industry = industry;
    else warn(`El rubro "${industry}" no existe; se mantiene el actual.`);
  }
  if (template) {
    if (Object.keys(TEMPLATES).includes(template)) store.template = template;
    else warn(`La plantilla "${template}" no existe; se mantiene la actual.`);
  }
  const free = raw['freeShippingFromCents'];
  if (free !== undefined && free !== null) {
    if (isCount(free, MAX_PRICE_CENTS) && free > 0)
      store.freeShippingFromCents = free;
    else warn('El monto de envío gratis no es válido; se ignora.');
  }
  const origin = clip(raw['shippingOriginUbigeo'], 6);
  if (origin) {
    if (/^\d{6}$/.test(origin) && findUbigeo(origin))
      store.shippingOriginUbigeo = origin;
    else warn(`El distrito de origen ${origin} no existe; se ignora.`);
  }
  if (isObject(raw['carrierRates'])) {
    const rates: { olva?: number[]; shalom?: number[] } = {};
    for (const carrier of ['olva', 'shalom'] as const) {
      const list = raw['carrierRates'][carrier];
      if (list === undefined) continue;
      if (
        Array.isArray(list) &&
        list.length === CARRIER_TIERS &&
        list.every((v) => isCount(v, MAX_CARRIER_RATE_CENTS))
      ) {
        rates[carrier] = list;
      } else {
        warn(
          `Las tarifas de ${carrier === 'olva' ? 'Olva' : 'Shalom'} no son válidas; se ignoran.`,
        );
      }
    }
    if (rates.olva || rates.shalom) store.carrierRates = rates;
  }
  return store;
}

export type ImportOptions = {
  updatePrices: boolean;
  updateStock: boolean;
  fullSync: boolean;
  applyStoreSettings: boolean;
};

export type ExistingProduct = {
  kind?: ProductKind;
  id: string;
  handle: string;
  name: string;
  basePriceCents: number;
  isPublishedOnStore: boolean;
  stockUnlimited: boolean;
  stockQty: number | null;
  variantCount: number;
  /** Handles of the sets that use this product as a piece. */
  usedInSets: string[];
};

export type StoreState = {
  industry: string;
  template: string;
  freeShippingFromCents: number | null;
  shippingOriginUbigeo: string | null;
  hasCarrierRates: boolean;
  heroImageUrl: string | null;
  bannerImageUrl: string | null;
};

export type PlanContext = {
  existing: ExistingProduct[];
  /** Package photo path → SHA-256 of the original file. */
  files: Map<string, string>;
  /** SHA-256 → stored URL (earlier imports of this tenant plus this run's uploads). */
  stored: Map<string, string>;
  options: ImportOptions;
  usage: { used: number; quota: number | null; expired: boolean };
  store: StoreState;
};

export type PlannedProduct = {
  product: ImportProduct;
  current: ExistingProduct | null;
  /** Fields that change price, stock or publication; absent keys are left untouched. */
  commerce: {
    basePriceCents?: number;
    isPublishedOnStore?: boolean;
    stockUnlimited?: boolean;
    stockQty?: number | null;
  };
  media: {
    url: string | null;
    hash: string;
    kind: 'image' | 'related';
    alt: string | null;
    caption: string | null;
  }[];
  missingPhotos: number;
};

export type StorePatch = {
  industry?: string;
  template?: string;
  freeShippingFromCents?: number;
  shippingOriginUbigeo?: string;
  carrierRates?: { olva?: number[]; shalom?: number[] };
  heroImageHash?: string;
  bannerImageHash?: string;
};

export type ImportPlan = {
  products: PlannedProduct[];
  hide: { id: string; handle: string; name: string }[];
  store: { patch: StorePatch; changes: string[] } | null;
  /** Photos the browser still has to upload: hash plus one package path holding that file. */
  uploads: { hash: string; path: string }[];
  issues: ImportIssue[];
  usage: { used: number; quota: number | null; after: number };
};

const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

export function planImport(
  parsed: ParsedCatalog,
  ctx: PlanContext,
): ImportPlan {
  const issues = [...parsed.issues];
  const byHandle = new Map(ctx.existing.map((row) => [row.handle, row]));
  const inFile = new Set(parsed.products.map((p) => p.handle));
  const setHandles = new Set(
    parsed.products.filter((p) => p.pieces.length > 0).map((p) => p.handle),
  );
  const pieceHandles = new Set(
    parsed.products.flatMap((p) => p.pieces.map((piece) => piece.handle)),
  );
  const uploads = new Map<string, string>();

  const resolve = (
    key: string,
  ): { hash: string; url: string | null } | null => {
    const hash = ctx.files.get(key);
    if (!hash) return null;
    const url = ctx.stored.get(hash) ?? null;
    if (!url && !uploads.has(hash)) uploads.set(hash, key);
    return { hash, url };
  };

  const products = parsed.products.map((product): PlannedProduct => {
    const current = byHandle.get(product.handle) ?? null;
    const label = `"${product.name}"`;
    const effectiveKind = product.kind ?? current?.kind ?? ProductKind.PRODUCT;
    if (product.kind && current?.kind && product.kind !== current.kind) {
      issues.push({ level: 'error', handle: product.handle, message: `${label}: cambia el tipo desde su ficha antes de importar.` });
    }
    if (effectiveKind !== 'PRODUCT' && pieceHandles.has(product.handle)) {
      issues.push({ level: 'error', handle: product.handle, message: `${label}: servicios y digitales no pueden ser piezas de un set.` });
    }
    if (
      current &&
      current.variantCount > 0 &&
      (product.pieces.length > 0 || pieceHandles.has(product.handle))
    ) {
      issues.push({
        level: 'error',
        handle: product.handle,
        message: `${label} tiene variantes en tu catálogo y el archivo lo usa en un set. Quita sus variantes antes de importar.`,
      });
    }
    if (
      current &&
      product.pieces.length > 0 &&
      current.usedInSets.some((set) => !setHandles.has(set))
    ) {
      issues.push({
        level: 'error',
        handle: product.handle,
        message: `${label} es pieza de otro set de tu catálogo y el archivo lo trae como set.`,
      });
    }

    const commerce: PlannedProduct['commerce'] = {};
    const sellable =
      product.active && product.priceCents !== null && product.priceCents > 0;
    if (!current) {
      commerce.basePriceCents = product.priceCents ?? 0;
      commerce.isPublishedOnStore = sellable;
      commerce.stockUnlimited = effectiveKind !== 'PRODUCT' || !product.holdsStock;
      commerce.stockQty = effectiveKind === 'PRODUCT' && product.holdsStock ? (product.stockQty ?? 0) : null;
      if (effectiveKind === 'PRODUCT' && product.holdsStock && product.stockQty === null) {
        issues.push({
          level: 'warning',
          handle: product.handle,
          message: `${label}: el inventario no trae su stock; entra con 0 unidades.`,
        });
      }
    } else {
      const unpriced =
        current.basePriceCents === 0 && !current.isPublishedOnStore;
      if (sellable && unpriced) {
        commerce.basePriceCents = product.priceCents!;
        commerce.isPublishedOnStore = true;
      } else if (
        ctx.options.updatePrices &&
        sellable &&
        product.priceCents !== current.basePriceCents
      ) {
        commerce.basePriceCents = product.priceCents!;
      }
      if (
        ctx.options.updateStock &&
        effectiveKind === 'PRODUCT' &&
        product.holdsStock &&
        product.stockQty !== null
      ) {
        if (current.stockUnlimited || current.stockQty !== product.stockQty) {
          commerce.stockUnlimited = false;
          commerce.stockQty = product.stockQty;
        }
      }
    }

    let missingPhotos = 0;
    const media: PlannedProduct['media'] = [];
    for (const image of product.images) {
      const found = resolve(image.key);
      if (!found) {
        missingPhotos += 1;
        continue;
      }
      media.push({
        url: found.url,
        hash: found.hash,
        kind: image.kind,
        alt: image.alt,
        caption: image.caption,
      });
    }
    if (missingPhotos) {
      issues.push({
        level: 'warning',
        handle: product.handle,
        message: `${label}: ${missingPhotos} ${missingPhotos === 1 ? 'foto no está' : 'fotos no están'} en la carpeta y se omiten.`,
      });
    }
    return { product, current, commerce, media, missingPhotos };
  });

  const hide = ctx.options.fullSync
    ? [
        ...ctx.existing.filter(
          (row) => row.isPublishedOnStore && !inFile.has(row.handle),
        ),
        ...parsed.products.flatMap((p) => {
          const row = byHandle.get(p.handle);
          return row?.isPublishedOnStore && !p.active ? [row] : [];
        }),
      ].map(({ id, handle, name }) => ({ id, handle, name }))
    : [];

  const created = products.filter((p) => !p.current).length;
  const after = ctx.usage.used + created;
  if (created && ctx.usage.expired) {
    issues.push({
      level: 'error',
      handle: null,
      message:
        'Tu plan venció. Renueva tu plan en Planes para importar productos.',
    });
  } else if (ctx.usage.quota !== null && after > ctx.usage.quota) {
    issues.push({
      level: 'error',
      handle: null,
      message: `Tu plan permite ${ctx.usage.quota} productos y con esta importación tendrías ${after}. Cambia de plan en Planes o reduce el archivo.`,
    });
  }

  return {
    products,
    hide,
    store:
      ctx.options.applyStoreSettings && parsed.store
        ? planStore(parsed.store, ctx, resolve, issues)
        : null,
    uploads: [...uploads].map(([hash, path]) => ({ hash, path })),
    issues,
    usage: { used: ctx.usage.used, quota: ctx.usage.quota, after },
  };
}

function planStore(
  store: ImportStoreSettings,
  ctx: PlanContext,
  resolve: (key: string) => { hash: string; url: string | null } | null,
  issues: ImportIssue[],
) {
  const patch: StorePatch = {};
  const changes: string[] = [];
  const current = ctx.store;
  const industry = store.industry ?? current.industry;
  let template = store.template ?? current.template;
  if (!templateAllowed(template, industry)) {
    if (store.template) {
      issues.push({
        level: 'warning',
        handle: null,
        message: `La plantilla "${store.template}" no está disponible para el rubro de la tienda; se usa la Clásica.`,
      });
    }
    template = 'classic';
  }
  if (industry !== current.industry) patch.industry = industry;
  if (template !== current.template) {
    patch.template = template;
    changes.push(
      `Plantilla de la tienda: ${template === 'selecta' ? 'Selecta' : 'Clásica'}`,
    );
  }
  if (
    store.freeShippingFromCents &&
    store.freeShippingFromCents !== current.freeShippingFromCents
  ) {
    patch.freeShippingFromCents = store.freeShippingFromCents;
    changes.push(`Envío gratis desde ${soles(store.freeShippingFromCents)}`);
  }
  if (store.shippingOriginUbigeo && !current.shippingOriginUbigeo) {
    patch.shippingOriginUbigeo = store.shippingOriginUbigeo;
    const district = findUbigeo(store.shippingOriginUbigeo);
    changes.push(
      `Despacho desde ${district ? `${district.district}, ${district.province}` : store.shippingOriginUbigeo}`,
    );
  }
  if (store.carrierRates && !current.hasCarrierRates) {
    patch.carrierRates = store.carrierRates;
    changes.push('Tarifas de courier por distancia');
  }
  for (const [field, key, label] of [
    [
      'heroImageHash',
      current.heroImageUrl ? null : store.heroImage,
      'Imagen principal de la tienda',
    ],
    [
      'bannerImageHash',
      current.bannerImageUrl ? null : store.bannerImage,
      'Imagen del banner',
    ],
  ] as const) {
    if (!key) continue;
    const found = resolve(key);
    if (!found) {
      issues.push({
        level: 'warning',
        handle: null,
        message: `${label}: la foto no está en la carpeta; se omite.`,
      });
      continue;
    }
    patch[field] = found.hash;
    changes.push(label);
  }
  return { patch, changes };
}
