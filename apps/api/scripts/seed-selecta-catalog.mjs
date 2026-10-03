// Loads the Selecta catalog (seed-data/selecta) into a tenant store and switches it to the
// Selecta template. Development only: production stores load the same folder from the console
// (Productos → Importar catálogo), which stores photos through the media pipeline and checks
// the plan quota. Run inside the api container:
// node scripts/seed-selecta-catalog.mjs <tenant-slug>
//
// Re-running refreshes names, texts, photos and set pieces. Price, stock, availability and
// publication of products that already exist are kept, so sales and console edits survive;
// only a product still without price (loaded before Selecta priced it) takes the new price.
// The store gets Selecta's free shipping threshold; origin and courier rates only when unset.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const [slug] = process.argv.slice(2);
if (!slug) throw new Error('Usage: node scripts/seed-selecta-catalog.mjs <tenant-slug>');

const DATA = new URL('../seed-data/selecta/', import.meta.url);
const { products, inventory, store } = JSON.parse(readFileSync(new URL('catalog.json', DATA), 'utf8'));
const UPLOADS = resolve(process.env.UPLOADS_DIR ?? 'uploads');
const PUBLIC_BASE = (process.env.PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
const HERO = store.heroImage.slice('/images/products/'.length);
const BANNER = store.bannerImage.slice('/images/products/'.length);
// Selecta's shipping rules: free from S/ 500, Olva/Shalom by distance from San Juan de Lurigancho.
const FREE_SHIPPING_FROM_CENTS = store.freeShippingFromCents;
const SHIPPING_ORIGIN_UBIGEO = store.shippingOriginUbigeo;
const CARRIER_RATES = store.carrierRates;

const clip = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const clips = (values, max = 400) => (Array.isArray(values) ? values.map((v) => clip(v, max)).filter(Boolean).slice(0, 20) : []);

/** Copies a catalog photo to the uploads volume under a stable name the media route accepts. */
async function publishImage(rel) {
  const ext = extname(rel).slice(1).toLowerCase().replace('jpeg', 'jpg');
  if (!['jpg', 'png', 'webp'].includes(ext)) return null;
  const file = `${createHash('sha256').update(`selecta/${rel}`).digest('hex').slice(0, 32)}.${ext}`;
  try {
    await copyFile(fileURLToPath(new URL(`images/${rel}`, DATA)), join(UPLOADS, file), constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return `${PUBLIC_BASE}/media/${file}`;
}

const stockOf = new Map(inventory.map((item) => [item.sku, item.stock]));
const isSet = (p) => p.content.format === 'set';
const singleSku = (p) => (p.content.inventory?.length === 1 && p.content.inventory[0].quantity === 1 ? p.content.inventory[0].sku : null);

// Each SKU belongs to one product that carries its stock: the individual product, or a closed
// set sold under its own SKU. Other sets consume the stock of those products.
const owner = new Map();
for (const p of products) if (!isSet(p) && singleSku(p)) owner.set(singleSku(p), p.slug);
for (const p of products) if (isSet(p) && singleSku(p) && !owner.has(singleSku(p))) owner.set(singleSku(p), p.slug);
const holds = (p) => owner.get(singleSku(p)) === p.slug;
for (const p of products) {
  if (holds(p)) continue;
  for (const { sku } of p.content.inventory ?? []) {
    if (!owner.has(sku)) throw new Error(`${p.slug}: no product carries SKU ${sku}`);
  }
}

function detailsOf(p) {
  const c = p.content;
  const pieces = c.includes ?? [];
  const single = !isSet(p) || (holds(p) && pieces.length <= 1);
  return {
    size: single ? clip(pieces[0]?.size, 60) : null,
    benefits: clips(c.benefits),
    usage: clips(c.usage),
    notes: clips(c.notes),
    highlights: single
      ? clips(pieces[0]?.details)
      : clips(pieces.map((piece) => [piece.name, piece.size].filter(Boolean).join(' · '))),
    montage: c.montage === true,
  };
}

async function mediaOf(p) {
  const media = [];
  for (const image of p.content.images ?? []) {
    const url = image.url?.startsWith('/images/products/') ? await publishImage(image.url.slice('/images/products/'.length)) : null;
    if (!url) continue;
    media.push({
      url,
      kind: image.kind === 'related' ? 'related' : 'image',
      alt: clip(image.alt, 160),
      caption: clip(image.caption, 200),
      sortOrder: media.length,
    });
  }
  return media.slice(0, 12);
}

const prisma = new PrismaClient();
try {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  await mkdir(UPLOADS, { recursive: true });
  const prepared = [];
  for (const [index, p] of products.entries()) {
    prepared.push({ p, media: await mediaOf(p), sortOrder: index });
  }
  const hero = await publishImage(HERO);
  const banner = await publishImage(BANNER);

  const summary = await prisma.$transaction(
    async (tx) => {
      const ids = new Map();
      const newlyPriced = [];
      let created = 0;
      for (const { p, media, sortOrder } of prepared) {
        const c = p.content;
        const holder = !isSet(p) || holds(p);
        const content = {
          name: p.name,
          descriptionShort: clip(c.summary, 300),
          descriptionFull: clip(c.description, 5000),
          categories: [p.category],
          brand: clip(c.brand, 60),
          line: clip(c.line, 80),
          sku: holder ? clip(singleSku(p), 60) : null,
          details: detailsOf(p),
          seoTitle: clip(c.title || p.name, 70),
          seoDescription: clip(c.summary, 160),
          sortOrder,
        };
        const existing = await tx.product.findUnique({
          where: { tenantId_handle: { tenantId: tenant.id, handle: p.slug } },
          select: { id: true, basePriceCents: true, isPublishedOnStore: true },
        });
        const priced =
          existing && existing.basePriceCents === 0 && !existing.isPublishedOnStore && p.active && p.priceCents !== null;
        if (priced) newlyPriced.push(p.slug);
        const product = existing
          ? await tx.product.update({
              where: { id: existing.id },
              data: priced ? { ...content, basePriceCents: p.priceCents, isPublishedOnStore: true } : content,
              select: { id: true },
            })
          : await tx.product.create({
              data: {
                ...content,
                tenantId: tenant.id,
                handle: p.slug,
                basePriceCents: p.priceCents ?? 0,
                isAvailable: true,
                stockUnlimited: !holder,
                stockQty: holder ? (stockOf.get(singleSku(p)) ?? 0) : null,
                isPublishedOnStore: p.active && p.priceCents !== null,
              },
              select: { id: true },
            });
        if (!existing) created += 1;
        await tx.productMedia.deleteMany({ where: { productId: product.id } });
        if (media.length) await tx.productMedia.createMany({ data: media.map((m) => ({ ...m, productId: product.id })) });
        ids.set(p.slug, product.id);
      }

      for (const p of products) {
        if (!isSet(p) || holds(p)) continue;
        const setId = ids.get(p.slug);
        await tx.productComponent.deleteMany({ where: { setId } });
        await tx.productComponent.createMany({
          data: p.content.inventory.map(({ sku, quantity }) => ({ setId, componentId: ids.get(owner.get(sku)), quantity })),
        });
      }

      const hidden = await tx.product.updateMany({
        where: { tenantId: tenant.id, handle: { notIn: products.map((p) => p.slug) }, isPublishedOnStore: true },
        data: { isPublishedOnStore: false },
      });

      await tx.tenantIntegration.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: 'store' } },
        create: { tenantId: tenant.id, key: 'store', enabled: true },
        update: { enabled: true },
      });
      const storefront = await tx.storefront.findUniqueOrThrow({ where: { tenantId: tenant.id } });
      const copy = storefront.templateCopy && typeof storefront.templateCopy === 'object' ? storefront.templateCopy : {};
      await tx.storefront.update({
        where: { tenantId: tenant.id },
        data: {
          industry: 'belleza',
          template: 'selecta',
          heroImageUrl: storefront.heroImageUrl ?? hero,
          deliveryEnabled: true,
          freeShippingFromCents: FREE_SHIPPING_FROM_CENTS,
          shippingOriginUbigeo: storefront.shippingOriginUbigeo ?? SHIPPING_ORIGIN_UBIGEO,
          carrierRates: storefront.carrierRates ?? CARRIER_RATES,
          templateCopy: { ...copy, bannerImageUrl: copy.bannerImageUrl ?? banner },
        },
      });
      return { created, updated: products.length - created, hidden: hidden.count, newlyPriced };
    },
    { timeout: 60_000 },
  );

  const unpublished = products.filter((p) => !p.active || p.priceCents === null).map((p) => p.slug);
  console.log(`Catálogo Selecta en ${slug}: ${summary.created} creados, ${summary.updated} actualizados.`);
  console.log(`Productos anteriores despublicados: ${summary.hidden}.`);
  if (summary.newlyPriced.length) console.log(`Con precio nuevo y publicados: ${summary.newlyPriced.join(', ')}`);
  if (unpublished.length) console.log(`Sin precio en Selecta (quedan sin publicar): ${unpublished.join(', ')}`);
} finally {
  await prisma.$disconnect();
}
