import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { assertManager } from '../common/roles';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { readTemplateContent, withContentField } from '../storefront/store-templates';
import {
  ExistingProduct,
  ImportIssue,
  ImportOptions,
  ImportPlan,
  imageKey,
  parseCatalogPackage,
  ParsedCatalog,
  planImport,
} from './catalog-import';
import { CatalogService } from './catalog.service';
import {
  CatalogImportCommitDto,
  CatalogImportPreviewDto,
} from './dto/catalog-import.dto';
import { MediaUploadDto } from './dto/inventory.dto';
import { MediaService } from './media.service';

const MANAGER_MESSAGE =
  'Solo el dueño o un administrador puede importar el catálogo.';

export type CatalogImportReport = {
  source: string | null;
  canImport: boolean;
  summary: {
    products: number;
    create: number;
    update: number;
    sets: number;
    publish: number;
    unpublished: number;
    priceChanges: number;
    stockChanges: number;
    hide: number;
    photos: number;
    uploads: number;
  };
  products: {
    handle: string;
    name: string;
    action: 'create' | 'update';
    isSet: boolean;
    priceCents: number;
    published: boolean;
    photos: number;
    missingPhotos: number;
    priceChange: { from: number; to: number } | null;
    stockChange: { from: number | null; to: number } | null;
  }[];
  hidden: { handle: string; name: string }[];
  store: { available: boolean; changes: string[] };
  plan: { used: number; quota: number | null; after: number };
  issues: ImportIssue[];
  uploads: { hash: string; path: string }[];
};

export type CatalogImportResult = {
  created: number;
  updated: number;
  published: number;
  hidden: number;
  storeUpdated: boolean;
};

type Prepared = {
  parsed: ParsedCatalog;
  plan: ImportPlan;
  stored: Map<string, string>;
  previousUrls: string[];
};

/**
 * Bulk catalog import from a package (catalog.json + photos). The preview and the commit run
 * the same plan; the commit writes it in one transaction, so a failed import changes nothing.
 * Existing products keep the price, stock and publication set in the console unless the
 * merchant opts in to overwrite them.
 */
@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly media: MediaService,
    private readonly catalog: CatalogService,
  ) {}

  async preview(
    user: AuthUserPayload,
    dto: CatalogImportPreviewDto,
  ): Promise<CatalogImportReport> {
    assertManager(user, MANAGER_MESSAGE);
    const { parsed, plan } = await this.prepare(user.tenantId, dto, new Map());
    return this.report(parsed, plan);
  }

  uploadPhoto(
    user: AuthUserPayload,
    dto: MediaUploadDto,
  ): Promise<{ url: string }> {
    assertManager(user, MANAGER_MESSAGE);
    return this.media.upload(user.tenantId, dto);
  }

  async commit(
    user: AuthUserPayload,
    dto: CatalogImportCommitDto,
  ): Promise<CatalogImportResult> {
    assertManager(user, MANAGER_MESSAGE);
    const { tenantId } = user;
    const uploaded = new Map<string, string>();
    for (const item of dto.uploaded) {
      if (!this.media.isOwnUpload(tenantId, item.url)) {
        throw new BadRequestException(
          'Alguna foto no pertenece a tu catálogo. Vuelve a intentar la importación.',
        );
      }
      uploaded.set(item.hash, item.url);
    }
    let previousUrls: string[] = [];
    try {
      const prepared = await this.prepare(tenantId, dto, uploaded);
      previousUrls = prepared.previousUrls;
      const blocking = prepared.plan.issues.find(
        (issue) => issue.level === 'error',
      );
      if (blocking) throw new BadRequestException(blocking.message);
      const pending = prepared.plan.uploads.length;
      if (pending) {
        throw new BadRequestException(
          `Faltan ${pending} ${pending === 1 ? 'foto' : 'fotos'} por subir. Vuelve a intentar la importación.`,
        );
      }
      return await this.write(
        tenantId,
        prepared,
        dto.options?.applyStoreSettings === true,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'El catálogo cambió mientras importabas. Vuelve a revisar la importación.',
        );
      }
      throw error;
    } finally {
      // Replaced photos and uploads the import did not end up using; used ones are kept.
      await this.catalog.releasePhotos(tenantId, [
        ...previousUrls,
        ...uploaded.values(),
      ]);
    }
  }

  private async prepare(
    tenantId: string,
    dto: CatalogImportPreviewDto,
    uploaded: Map<string, string>,
  ): Promise<Prepared> {
    const parsed = parseCatalogPackage(dto.catalog);
    const files = new Map<string, string>();
    for (const file of dto.files) {
      const key = imageKey(file.path);
      if (key) files.set(key, file.hash);
    }
    const hashes = [...new Set(files.values())];
    const [products, storedRows, usage, storefront] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId },
        select: {
          id: true,
          handle: true,
          name: true,
          basePriceCents: true,
          isPublishedOnStore: true,
          stockUnlimited: true,
          stockQty: true,
          media: { select: { url: true } },
          _count: { select: { variants: true } },
          componentOf: { select: { set: { select: { handle: true } } } },
        },
      }),
      hashes.length
        ? this.prisma.productMedia.findMany({
            where: { sourceHash: { in: hashes }, product: { tenantId } },
            select: { sourceHash: true, url: true },
          })
        : Promise.resolve([]),
      this.planLimits.getUsage(tenantId),
      this.prisma.storefront.findUnique({ where: { tenantId } }),
    ]);

    const stored = new Map<string, string>();
    for (const row of storedRows)
      if (row.sourceHash) stored.set(row.sourceHash, row.url);
    for (const [hash, url] of uploaded) stored.set(hash, url);

    const existing: ExistingProduct[] = products.map((row) => ({
      id: row.id,
      handle: row.handle,
      name: row.name,
      basePriceCents: row.basePriceCents,
      isPublishedOnStore: row.isPublishedOnStore,
      stockUnlimited: row.stockUnlimited,
      stockQty: row.stockQty,
      variantCount: row._count.variants,
      usedInSets: row.componentOf.map((link) => link.set.handle),
    }));
    const options: ImportOptions = {
      updatePrices: dto.options?.updatePrices === true,
      updateStock: dto.options?.updateStock === true,
      fullSync: dto.options?.fullSync === true,
      applyStoreSettings: dto.options?.applyStoreSettings === true,
    };
    const plan = planImport(parsed, {
      existing,
      files,
      stored,
      options,
      usage: {
        used: usage.productsUsed,
        quota: usage.productQuota,
        expired: usage.planStatus === 'EXPIRED',
      },
      store: {
        industry: storefront?.industry ?? 'general',
        template: storefront?.template ?? 'classic',
        freeShippingFromCents: storefront?.freeShippingFromCents ?? null,
        shippingOriginUbigeo: storefront?.shippingOriginUbigeo ?? null,
        hasCarrierRates: Boolean(storefront?.carrierRates),
        heroImageUrl: storefront?.heroImageUrl ?? null,
        bannerImageUrl:
          readTemplateContent(storefront?.templateContent).sections['banner']?.['image'] || null,
      },
    });
    const replaced = new Set(
      plan.products.flatMap((item) =>
        item.current ? [item.current.handle] : [],
      ),
    );
    const previousUrls = products
      .filter((row) => replaced.has(row.handle))
      .flatMap((row) => row.media.map((m) => m.url));
    return { parsed, plan, stored, previousUrls };
  }

  private async write(
    tenantId: string,
    prepared: Prepared,
    applyStore: boolean,
  ): Promise<CatalogImportResult> {
    const { plan, stored } = prepared;
    return this.prisma.$transaction(
      async (tx) => {
        const ids = new Map<string, string>();
        let created = 0;
        let published = 0;
        for (const item of plan.products) {
          const p = item.product;
          const content = {
            name: p.name,
            descriptionShort: p.descriptionShort,
            descriptionFull: p.descriptionFull,
            categories: p.categories,
            brand: p.brand,
            line: p.line,
            sku: p.sku,
            details: p.details as unknown as Prisma.JsonObject,
            seoTitle: p.seoTitle,
            seoDescription: p.seoDescription,
            sortOrder: p.sortOrder,
          };
          let id: string;
          if (item.current) {
            id = item.current.id;
            await tx.product.updateMany({
              where: { id, tenantId },
              data: { ...content, ...item.commerce },
            });
            await tx.productMedia.deleteMany({ where: { productId: id } });
            if (p.holdsStock)
              await tx.productComponent.deleteMany({ where: { setId: id } });
          } else {
            const row = await tx.product.create({
              data: {
                ...content,
                tenantId,
                handle: p.handle,
                currency: 'PEN',
                isAvailable: true,
                basePriceCents: item.commerce.basePriceCents ?? 0,
                isPublishedOnStore: item.commerce.isPublishedOnStore ?? false,
                stockUnlimited: item.commerce.stockUnlimited ?? true,
                stockQty: item.commerce.stockQty ?? null,
              },
              select: { id: true },
            });
            id = row.id;
            created += 1;
          }
          if (item.commerce.isPublishedOnStore) published += 1;
          const media = item.media.flatMap((m) => {
            const url = m.url ?? stored.get(m.hash);
            return url
              ? [
                  {
                    url,
                    kind: m.kind,
                    alt: m.alt,
                    caption: m.caption,
                    sourceHash: m.hash,
                  },
                ]
              : [];
          });
          if (media.length) {
            await tx.productMedia.createMany({
              data: media.map((m, index) => ({
                ...m,
                productId: id,
                sortOrder: index,
              })),
            });
          }
          ids.set(p.handle, id);
        }

        const setIds: string[] = [];
        for (const item of plan.products) {
          if (item.product.holdsStock) continue;
          const setId = ids.get(item.product.handle)!;
          setIds.push(setId);
          await tx.productComponent.deleteMany({ where: { setId } });
          await tx.productComponent.createMany({
            data: item.product.pieces.map((piece) => ({
              setId,
              componentId: ids.get(piece.handle)!,
              quantity: piece.quantity,
            })),
          });
        }
        if (
          setIds.length &&
          (await tx.productComponent.count({
            where: { componentId: { in: setIds } },
          }))
        ) {
          throw new BadRequestException(
            'Un set del archivo es pieza de otro set de tu catálogo. Revisa la importación.',
          );
        }

        if (plan.hide.length) {
          await tx.product.updateMany({
            where: { tenantId, id: { in: plan.hide.map((row) => row.id) } },
            data: { isPublishedOnStore: false },
          });
        }

        const storeUpdated =
          applyStore &&
          plan.store !== null &&
          Object.keys(plan.store.patch).length > 0;
        if (storeUpdated && plan.store) {
          const { patch } = plan.store;
          const current = await tx.storefront.findUnique({
            where: { tenantId },
          });
          const banner = patch.bannerImageHash
            ? stored.get(patch.bannerImageHash)
            : undefined;
          const withBanner = (value: Prisma.JsonValue | undefined) =>
            withContentField(readTemplateContent(value), 'banner', 'image', banner!) as Prisma.JsonObject;
          const data = {
            industry: patch.industry,
            template: patch.template,
            freeShippingFromCents: patch.freeShippingFromCents,
            shippingOriginUbigeo: patch.shippingOriginUbigeo,
            carrierRates: patch.carrierRates,
            heroImageUrl: patch.heroImageHash
              ? stored.get(patch.heroImageHash)
              : undefined,
            templateContent: banner ? withBanner(current?.templateContent) : undefined,
            templateDraft: banner && current?.templateDraft ? withBanner(current.templateDraft) : undefined,
          };
          if (current) {
            await tx.storefront.update({ where: { tenantId }, data });
          } else {
            const tenant = await tx.tenant.findUniqueOrThrow({
              where: { id: tenantId },
              select: { name: true },
            });
            await tx.storefront.create({
              data: { ...data, tenantId, displayName: tenant.name },
            });
          }
        }

        return {
          created,
          updated: plan.products.length - created,
          published,
          hidden: plan.hide.length,
          storeUpdated,
        };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  private report(parsed: ParsedCatalog, plan: ImportPlan): CatalogImportReport {
    const hidden = new Set(plan.hide.map((row) => row.handle));
    const products = plan.products.map(
      (item): CatalogImportReport['products'][number] => {
        const { product, current, commerce } = item;
        const price = commerce.basePriceCents ?? current?.basePriceCents ?? 0;
        const published =
          !hidden.has(product.handle) &&
          (commerce.isPublishedOnStore ?? current?.isPublishedOnStore ?? false);
        return {
          handle: product.handle,
          name: product.name,
          action: current ? 'update' : 'create',
          isSet: !product.holdsStock,
          priceCents: price,
          published,
          photos: item.media.length,
          missingPhotos: item.missingPhotos,
          priceChange:
            current &&
            commerce.basePriceCents !== undefined &&
            commerce.basePriceCents !== current.basePriceCents
              ? { from: current.basePriceCents, to: commerce.basePriceCents }
              : null,
          stockChange:
            current &&
            commerce.stockQty !== undefined &&
            commerce.stockQty !== null
              ? {
                  from: current.stockUnlimited ? null : current.stockQty,
                  to: commerce.stockQty,
                }
              : null,
        };
      },
    );
    const create = products.filter((p) => p.action === 'create').length;
    return {
      source: parsed.source,
      canImport:
        products.length > 0 &&
        !plan.issues.some((issue) => issue.level === 'error'),
      summary: {
        products: products.length,
        create,
        update: products.length - create,
        sets: products.filter((p) => p.isSet).length,
        publish: plan.products.filter(
          (item) => item.commerce.isPublishedOnStore === true,
        ).length,
        unpublished: products.filter((p) => !p.published).length,
        priceChanges: products.filter((p) => p.priceChange).length,
        stockChanges: products.filter((p) => p.stockChange).length,
        hide: plan.hide.length,
        photos: products.reduce((sum, p) => sum + p.photos, 0),
        uploads: plan.uploads.length,
      },
      products,
      hidden: plan.hide.map(({ handle, name }) => ({ handle, name })),
      store: {
        available: parsed.store !== null,
        changes: plan.store?.changes ?? [],
      },
      plan: plan.usage,
      issues: plan.issues,
      uploads: plan.uploads,
    };
  }
}
