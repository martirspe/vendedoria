import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductKind } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  ProductComponentInputDto,
  ProductExtrasDto,
  ProductVariantInputDto,
} from './dto/create-product.dto';
import { InventoryUpdateDto } from './dto/inventory.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MediaService } from './media.service';

const PRODUCT_INCLUDE = {
  variants: true,
  media: { orderBy: { sortOrder: 'asc' } },
  components: {
    orderBy: { id: 'asc' },
    include: {
      component: { select: { id: true, name: true, handle: true, sku: true } },
    },
  },
} satisfies Prisma.ProductInclude;

const MAX_MEDIA = 12;

type Tx = Prisma.TransactionClient;

type PhotoRefs = {
  media: { url: string }[];
  variants: { imageUrl: string | null }[];
};
const photoUrls = (product: PhotoRefs) => [
  ...product.media.map((item) => item.url),
  ...product.variants.flatMap((variant) =>
    variant.imageUrl ? [variant.imageUrl] : [],
  ),
];

type InventoryRow = {
  productId: string;
  variantId: string | null;
  name: string;
  option: string | null;
  sku: string | null;
  stockUnlimited: boolean;
  stockQty: number | null;
  usedInSets: number;
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly media: MediaService,
  ) {}

  list(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateProductDto) {
    await this.planLimits.assertCanCreateProduct(tenantId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const kind = dto.kind ?? ProductKind.PRODUCT;
        const stockless = kind !== ProductKind.PRODUCT;
        this.assertDigitalAccess(kind, dto.digitalAccessUrl, dto.isAvailable ?? true);
        const product = await tx.product.create({
          data: {
            tenantId,
            handle: dto.handle,
            name: dto.name,
            descriptionShort: dto.descriptionShort,
            descriptionFull: dto.descriptionFull,
            categories: dto.categories ?? [],
            basePriceCents: dto.basePriceCents,
            currency: dto.currency ?? 'PEN',
            isAvailable: dto.isAvailable ?? true,
            stockUnlimited: stockless ? true : (dto.stockUnlimited ?? true),
            stockQty: stockless ? null : dto.stockQty,
            ...this.kindData(dto, kind),
            isPublishedOnStore: dto.isPublishedOnStore ?? false,
            compareAtPriceCents: dto.compareAtPriceCents ?? null,
            brand: dto.brand?.trim() || null,
            sortOrder: dto.sortOrder ?? 0,
            seoTitle: dto.seoTitle?.trim() || null,
            seoDescription: dto.seoDescription?.trim() || null,
            ...this.extrasData(dto),
            variants: dto.variants?.length
              ? {
                  create: dto.variants.map((variant) =>
                    this.toVariantData(variant, stockless),
                  ),
                }
              : undefined,
          },
        });
        await this.writeMedia(tx, product.id, dto);
        if (stockless)
          await this.assertStocklessShape(
            tx,
            product.id,
            kind,
            dto.components,
            0,
          );
        await this.writeComponents(
          tx,
          tenantId,
          product.id,
          dto.components,
          dto.variants?.length ?? 0,
        );
        return tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: PRODUCT_INCLUDE,
        });
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(tenantId: string, productId: string, dto: UpdateProductDto) {
    const before = await this.getById(tenantId, productId);
    const kind = dto.kind ?? before.kind;
    const stockless = kind !== ProductKind.PRODUCT;
    this.assertDigitalAccess(kind, dto.digitalAccessUrl === undefined ? before.digitalAccessUrl : dto.digitalAccessUrl,
      dto.isAvailable ?? before.isAvailable);
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        if (dto.variants) {
          await this.writeVariants(tx, productId, dto.variants, stockless);
        } else if (stockless) {
          await tx.productVariant.updateMany({
            where: { productId },
            data: { stockQty: null },
          });
        }
        await this.writeMedia(tx, productId, dto, true);
        const variantCount = dto.variants
          ? dto.variants.length
          : await tx.productVariant.count({ where: { productId } });
        if (stockless) {
          await this.assertStocklessShape(
            tx,
            productId,
            kind,
            dto.components,
            before.components.length,
          );
        }
        await this.writeComponents(
          tx,
          tenantId,
          productId,
          dto.components,
          variantCount,
        );

        return tx.product.update({
          where: { id: productId },
          data: {
            handle: dto.handle,
            name: dto.name,
            descriptionShort: dto.descriptionShort,
            descriptionFull: dto.descriptionFull,
            categories: dto.categories,
            basePriceCents: dto.basePriceCents,
            currency: dto.currency,
            isAvailable: dto.isAvailable,
            ...(stockless
              ? { stockUnlimited: true, stockQty: null }
              : {
                  stockUnlimited: dto.stockUnlimited,
                  stockQty: dto.stockQty === null ? null : dto.stockQty,
                }),
            ...this.kindData(dto, kind),
            isPublishedOnStore: dto.isPublishedOnStore,
            compareAtPriceCents: dto.compareAtPriceCents,
            brand: this.optionalText(dto.brand),
            sortOrder: dto.sortOrder,
            seoTitle: this.optionalText(dto.seoTitle),
            seoDescription: this.optionalText(dto.seoDescription),
            ...this.extrasData(dto),
          },
          include: PRODUCT_INCLUDE,
        });
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
    const kept = new Set(photoUrls(updated));
    await this.releasePhotos(
      tenantId,
      photoUrls(before).filter((url) => !kept.has(url)),
    );
    return updated;
  }

  async getById(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado.');
    }
    return product;
  }

  /** Order lines keep their title and price snapshot; set pieces must leave their sets first. */
  async remove(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: {
        id: true,
        media: { select: { url: true } },
        variants: { select: { imageUrl: true } },
        _count: { select: { componentOf: true } },
      },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado.');
    }
    const inSet = new ConflictException(
      'Este producto es pieza de un set. Quítalo del set antes de eliminarlo.',
    );
    if (product._count.componentOf > 0) throw inSet;
    try {
      await this.prisma.product.delete({ where: { id: product.id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw inSet;
      }
      throw error;
    }
    await this.releasePhotos(tenantId, photoUrls(product));
    return { deleted: true };
  }

  /** Deletes stored photos no longer used by any product, variant or store setting of the tenant. */
  async releasePhotos(tenantId: string, urls: string[]) {
    if (!urls.length) return;
    const [media, variants, storefront] = await Promise.all([
      this.prisma.productMedia.findMany({
        where: { url: { in: urls }, product: { tenantId } },
        select: { url: true },
      }),
      this.prisma.productVariant.findMany({
        where: { imageUrl: { in: urls }, product: { tenantId } },
        select: { imageUrl: true },
      }),
      this.prisma.storefront.findUnique({ where: { tenantId } }),
    ]);
    const used = new Set<string | null>([
      ...media.map((m) => m.url),
      ...variants.map((v) => v.imageUrl),
    ]);
    const storeSettings = storefront ? JSON.stringify(storefront) : '';
    await this.media.remove(
      tenantId,
      urls.filter((url) => !used.has(url) && !storeSettings.includes(url)),
    );
  }

  /** Stock rows by SKU: products without variants and every variant of the others (services have no stock). */
  async inventory(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, kind: ProductKind.PRODUCT },
      select: {
        id: true,
        name: true,
        handle: true,
        sku: true,
        stockUnlimited: true,
        stockQty: true,
        isAvailable: true,
        variants: {
          select: {
            id: true,
            sku: true,
            stockQty: true,
            option1Value: true,
            option2Value: true,
          },
        },
        _count: { select: { components: true, componentOf: true } },
      },
      orderBy: { name: 'asc' },
    });
    return products.flatMap((product): InventoryRow[] => {
      if (product._count.components > 0) return [];
      if (product.variants.length) {
        return product.variants.map((variant) => ({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          option:
            [variant.option1Value, variant.option2Value]
              .filter(Boolean)
              .join(' / ') || null,
          sku: variant.sku,
          stockUnlimited: product.stockUnlimited && variant.stockQty === null,
          stockQty: variant.stockQty,
          usedInSets: product._count.componentOf,
        }));
      }
      return [
        {
          productId: product.id,
          variantId: null,
          name: product.name,
          option: null,
          sku: product.sku,
          stockUnlimited: product.stockUnlimited,
          stockQty: product.stockQty,
          usedInSets: product._count.componentOf,
        },
      ];
    });
  }

  async updateInventory(tenantId: string, dto: InventoryUpdateDto) {
    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: row.productId, tenantId },
          select: {
            id: true,
            kind: true,
            _count: { select: { components: true } },
          },
        });
        if (!product) throw new NotFoundException('Producto no encontrado.');
        if (product.kind !== ProductKind.PRODUCT) {
          throw new BadRequestException(
            'Los servicios y productos digitales no llevan stock.',
          );
        }
        if (product._count.components > 0) {
          throw new BadRequestException(
            'El stock de un set sale de sus piezas.',
          );
        }
        if (row.variantId) {
          const { count } = await tx.productVariant.updateMany({
            where: { id: row.variantId, productId: product.id },
            data: { stockQty: row.stockQty },
          });
          if (!count) throw new NotFoundException('Variante no encontrada.');
          if (row.stockQty !== null) {
            await tx.product.update({
              where: { id: product.id },
              data: { stockUnlimited: false },
            });
          }
        } else {
          await tx.product.update({
            where: { id: product.id },
            data:
              row.stockQty === null
                ? { stockUnlimited: true, stockQty: null }
                : { stockUnlimited: false, stockQty: row.stockQty },
          });
        }
      }
    });
    return this.inventory(tenantId);
  }

  private kindData(dto: ProductExtrasDto, kind: ProductKind) {
    const none = {
      durationMinutes: null,
      serviceMode: null,
      digitalAccessUrl: null,
      digitalInstructions: null,
    };
    if (kind === ProductKind.SERVICE) {
      return {
        ...none,
        kind,
        durationMinutes: dto.durationMinutes,
        serviceMode: dto.serviceMode,
      };
    }
    if (kind === ProductKind.DIGITAL) {
      return {
        ...none,
        kind,
        digitalAccessUrl: this.optionalText(dto.digitalAccessUrl),
        digitalInstructions: this.optionalText(dto.digitalInstructions),
      };
    }
    return { ...none, kind };
  }

  private assertDigitalAccess(kind: ProductKind, url: string | null | undefined, available: boolean) {
    if (kind === ProductKind.DIGITAL && available && !url?.trim()) {
      throw new BadRequestException('Agrega el enlace de acceso antes de ofrecer este producto digital.');
    }
  }

  /** Services and digital products have no stock of their own, so they can neither be a set nor a set piece. */
  private async assertStocklessShape(
    tx: Tx,
    productId: string,
    kind: ProductKind,
    components: ProductComponentInputDto[] | undefined,
    currentComponents: number,
  ) {
    const label =
      kind === ProductKind.DIGITAL ? 'un producto digital' : 'un servicio';
    if (
      (components ?? []).length > 0 ||
      (components === undefined && currentComponents > 0)
    ) {
      throw new BadRequestException(
        `${label.charAt(0).toUpperCase()}${label.slice(1)} no puede ser un set.`,
      );
    }
    const usedAsPiece = await tx.productComponent.count({
      where: { componentId: productId },
    });
    if (usedAsPiece > 0) {
      throw new BadRequestException(
        `Este producto es pieza de un set; no puede ser ${label}.`,
      );
    }
  }

  private extrasData(dto: ProductExtrasDto) {
    return {
      sku: this.optionalText(dto.sku),
      line: this.optionalText(dto.line),
      ...(dto.details !== undefined
        ? {
            details: dto.details
              ? (JSON.parse(JSON.stringify(dto.details)) as Prisma.JsonObject)
              : Prisma.DbNull,
          }
        : {}),
    };
  }

  /** `media` (with alt and captions) wins over the legacy `mediaUrls` list. */
  private async writeMedia(
    tx: Tx,
    productId: string,
    dto: Pick<CreateProductDto, 'media' | 'mediaUrls'>,
    replace = false,
  ) {
    const rows = dto.media
      ? dto.media.slice(0, MAX_MEDIA).map((item) => ({
          url: item.url.trim(),
          kind: item.kind ?? 'image',
          alt: item.alt?.trim() || null,
          caption: item.caption?.trim() || null,
        }))
      : dto.mediaUrls
        ? dto.mediaUrls
            .map((url) => url.trim())
            .filter(Boolean)
            .slice(0, MAX_MEDIA)
            .map((url) => ({ url, kind: 'image', alt: null, caption: null }))
        : null;
    if (!rows) return;
    if (replace) await tx.productMedia.deleteMany({ where: { productId } });
    if (rows.length) {
      await tx.productMedia.createMany({
        data: rows.map((row, index) => ({
          ...row,
          productId,
          sortOrder: index,
        })),
      });
    }
  }

  /** A set takes its pieces' stock: pieces are simple products of the same business. */
  private async writeComponents(
    tx: Tx,
    tenantId: string,
    productId: string,
    components: ProductComponentInputDto[] | undefined,
    variantCount: number,
  ) {
    if (components === undefined) return;
    const unique = new Map(components.map((c) => [c.productId, c.quantity]));
    if (unique.size !== components.length) {
      throw new BadRequestException(
        'Cada pieza del set debe aparecer una sola vez.',
      );
    }
    if (unique.has(productId)) {
      throw new BadRequestException('Un set no puede incluirse a sí mismo.');
    }
    if (unique.size) {
      if (variantCount > 0) {
        throw new BadRequestException(
          'Un set no puede tener variantes: el stock sale de sus piezas.',
        );
      }
      const usedAsPiece = await tx.productComponent.count({
        where: { componentId: productId },
      });
      if (usedAsPiece > 0) {
        throw new BadRequestException(
          'Este producto es pieza de otro set; no puede ser un set.',
        );
      }
      const pieces = await tx.product.findMany({
        where: { tenantId, id: { in: [...unique.keys()] } },
        select: {
          id: true,
          kind: true,
          _count: { select: { variants: true, components: true } },
        },
      });
      if (pieces.length !== unique.size) {
        throw new BadRequestException('Alguna pieza del set no existe.');
      }
      if (pieces.some((piece) => piece.kind !== ProductKind.PRODUCT)) {
        throw new BadRequestException(
          'Los servicios y productos digitales no pueden ser pieza de un set.',
        );
      }
      if (
        pieces.some(
          (piece) => piece._count.variants > 0 || piece._count.components > 0,
        )
      ) {
        throw new BadRequestException(
          'Las piezas deben ser productos simples (sin variantes ni sets).',
        );
      }
    }
    await tx.productComponent.deleteMany({ where: { setId: productId } });
    if (unique.size) {
      await tx.productComponent.createMany({
        data: [...unique].map(([componentId, quantity]) => ({
          setId: productId,
          componentId,
          quantity,
        })),
      });
    }
  }

  private mapConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'Ya tienes un producto con ese enlace. Usa otro.',
      );
    }
    return error;
  }

  private optionalText(value: string | null | undefined) {
    if (value === undefined) {
      return undefined;
    }
    return value?.trim() || null;
  }

  /** Variants sent with their id keep it, so carts, inventory rows and order lines stay linked. */
  private async writeVariants(
    tx: Tx,
    productId: string,
    variants: ProductVariantInputDto[],
    stockless: boolean,
  ) {
    const keep = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
    await tx.productVariant.deleteMany({
      where: { productId, id: { notIn: keep } },
    });
    for (const variant of variants) {
      const data = this.toVariantData(variant, stockless);
      if (variant.id) {
        const { count } = await tx.productVariant.updateMany({
          where: { id: variant.id, productId },
          data,
        });
        if (count) continue;
      }
      await tx.productVariant.create({ data: { productId, ...data } });
    }
  }

  private toVariantData(variant: ProductVariantInputDto, stockless = false) {
    return {
      sku: variant.sku?.trim() || null,
      option1Name: variant.option1Name ?? null,
      option1Value: variant.option1Value ?? null,
      option2Name: variant.option2Name ?? null,
      option2Value: variant.option2Value ?? null,
      option3Name: variant.option3Name ?? null,
      option3Value: variant.option3Value ?? null,
      imageUrl: variant.imageUrl?.trim() || null,
      priceCents: variant.priceCents,
      isAvailable: variant.isAvailable ?? true,
      stockQty: stockless ? null : (variant.stockQty ?? null),
    };
  }
}
