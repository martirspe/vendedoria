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
import { categorySchema, classificationDetails, validateAttributeValues } from './catalog-classification';
import { combinationKey, MAX_VARIANTS, normalizeOption, variantOptions, type OptionRecord } from './variant-options';

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

  async categories() {
    const categories = await this.prisma.catalogCategory.findMany({ orderBy: { name: 'asc' } });
    return categories.map((category) => categorySchema(categories, category.id));
  }

  private assertVariants(variants: ProductVariantInputDto[] | undefined) {
    if (!variants) return;
    if (variants.length > MAX_VARIANTS) throw new BadRequestException(`Máximo ${MAX_VARIANTS} combinaciones por producto.`);
    const keys = new Set<string>();
    const skus = new Set<string>();
    const ids = new Set<string>();
    let axes: string | undefined;
    const labels = new Map<string, string>();
    for (const variant of variants) {
      if (!Number.isInteger(variant.priceCents) || variant.priceCents < 0 || variant.priceCents > 2147483647 ||
        (variant.stockQty != null && (!Number.isInteger(variant.stockQty) || variant.stockQty < 0 || variant.stockQty > 2147483647)))
        throw new BadRequestException('Los precios y el stock de variantes deben ser cantidades válidas, sin negativos.');
      const options = variantOptions(variant);
      const names = options.map((option) => normalizeOption(option.name));
      if (!options.length || options.length > 5 || options.some((option) => !option.name || !option.value || option.name.length > 60 || option.value.length > 200) || new Set(names).size !== names.length)
        throw new BadRequestException('Cada combinación necesita atributos distintos y valores completos.');
      const shape = JSON.stringify([...names].sort());
      if (axes !== undefined && axes !== shape) throw new BadRequestException('Todas las variantes deben usar los mismos atributos.');
      axes = shape;
      options.forEach((option) => { if (!labels.has(normalizeOption(option.name))) labels.set(normalizeOption(option.name), option.name); });
      variant.options = options.map((option) => ({ ...option, name: labels.get(normalizeOption(option.name))! }));
      const key = combinationKey(options);
      if (keys.has(key)) throw new BadRequestException('Hay combinaciones repetidas. Revisa sus atributos.');
      keys.add(key);
      const sku = variant.sku ? normalizeOption(variant.sku) : '';
      if (sku && skus.has(sku)) throw new BadRequestException('Cada variante debe tener un SKU distinto.');
      if (sku) skus.add(sku);
      if (variant.id && ids.has(variant.id)) throw new BadRequestException('Una variante aparece más de una vez.');
      if (variant.id) ids.add(variant.id);
    }
  }

  private async classificationData(tx: Tx, dto: ProductExtrasDto, kind: ProductKind, variants: OptionRecord[], previous?: { categoryId: string | null; attributeValues: Prisma.JsonValue | null; details?: Prisma.JsonValue | null }) {
    const categoryId = dto.categoryId === undefined ? previous?.categoryId : dto.categoryId;
    const categories = categoryId || previous?.categoryId ? await tx.catalogCategory.findMany() : [];
    const previousDefinitions = previous?.categoryId ? categorySchema(categories, previous.categoryId).attributes : [];
    const rawDetails = dto.details === undefined ? previous?.details : dto.details;
    if (!categoryId) {
      if (dto.attributeValues && Object.keys(dto.attributeValues).length) throw new BadRequestException('Elige una categoría para guardar sus características.');
      return dto.categoryId === undefined && dto.attributeValues === undefined ? {} : {
        categoryId: null, attributeValues: Prisma.DbNull,
        ...(previousDefinitions.length ? { details: classificationDetails(rawDetails, previousDefinitions, [], {}) ?? Prisma.DbNull } : {}),
      };
    }
    const schema = categorySchema(categories, categoryId);
    if (schema.kind !== kind) throw new BadRequestException('La categoría no corresponde al tipo de producto.');
    const old = previous?.categoryId === categoryId ? previous.attributeValues : null;
    const values = dto.attributeValues === undefined ? (old ?? {}) : (dto.attributeValues ?? {});
    const pairs = variants.flatMap(variantOptions);
    for (const pair of pairs) {
      const definition = schema.attributes.find((attribute) => normalizeOption(attribute.name) === normalizeOption(pair.name));
      if (definition && (!definition.variant || (definition.values?.length && !definition.values.includes(pair.value))))
        throw new BadRequestException(`El atributo ${pair.name} no permite esa variación.`);
    }
    const attributes = validateAttributeValues(schema.attributes, values as Record<string, string>, pairs.map((pair) => pair.name));
    return { categoryId, attributeValues: attributes as Prisma.InputJsonObject, details: classificationDetails(rawDetails, previousDefinitions, schema.attributes, attributes) ?? Prisma.DbNull };
  }

  async create(tenantId: string, dto: CreateProductDto) {
    this.assertVariants(dto.variants);
    if (dto.variants?.some((variant) => variant.id)) throw new BadRequestException('Las variantes de un producto nuevo no deben tener un ID existente.');
    await this.planLimits.assertCanCreateProduct(tenantId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const kind = dto.kind ?? ProductKind.PRODUCT;
        const stockless = kind !== ProductKind.PRODUCT;
        const classification = await this.classificationData(tx, dto, kind, dto.variants ?? []);
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
            ...classification,
            variants: dto.variants?.length
              ? {
                  create: dto.variants.map((variant) =>
                    this.toVariantData(variant, stockless, dto.basePriceCents),
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
    this.assertVariants(dto.variants);
    const before = await this.getById(tenantId, productId);
    if (dto.expectedUpdatedAt && Date.parse(dto.expectedUpdatedAt) !== before.updatedAt.getTime()) throw new ConflictException('El producto cambió mientras lo editabas. Vuelve a abrirlo antes de guardar.');
    const kind = dto.kind ?? before.kind;
    const stockless = kind !== ProductKind.PRODUCT;
    this.assertDigitalAccess(kind, dto.digitalAccessUrl === undefined ? before.digitalAccessUrl : dto.digitalAccessUrl,
      dto.isAvailable ?? before.isAvailable);
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        // Serialize edits to the same product, including set recipes and combination keys.
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const current = await tx.product.findFirstOrThrow({ where: { id: productId, tenantId }, include: PRODUCT_INCLUDE });
        if (current.updatedAt.getTime() !== before.updatedAt.getTime()) throw new ConflictException('El producto cambió mientras lo editabas. Vuelve a abrirlo antes de guardar.');
        const classification = await this.classificationData(tx, dto, kind, dto.variants ?? current.variants.map((variant) => ({ ...variant, options: variantOptions(variant), sku: variant.sku ?? undefined })), current);
        if (dto.variants) {
          await this.writeVariants(tx, productId, dto.variants, stockless, dto.basePriceCents ?? current.basePriceCents);
        } else if (stockless) {
          await tx.productVariant.updateMany({
            where: { productId },
            data: { stockQty: null },
          });
        }
        if (dto.basePriceCents !== undefined && !dto.variants) {
          await tx.productVariant.updateMany({ where: { productId, priceInherited: true }, data: { priceCents: dto.basePriceCents } });
        }
        await this.writeMedia(tx, productId, dto, true);
        const variantCount = dto.variants
          ? dto.variants.length
          : await tx.productVariant.count({ where: { productId } });
        if (variantCount && (dto.components ?? current.components).length) throw new BadRequestException('Un set no puede tener variantes.');
        if (variantCount && await tx.productComponent.count({ where: { componentId: productId } })) throw new BadRequestException('Este producto es pieza de un set; quítalo del set antes de agregar variantes.');
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
            ...classification,
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
            option3Name: true,
            option3Value: true,
            options: true,
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
            variantOptions(variant).map((option) => option.value)
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return new ConflictException('Este producto o una variante están vinculados a otras ventas. Desactívalos antes de retirarlos.');
    }
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
    basePriceCents: number,
  ) {
    const keep = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
    // Coordinate replacement with stock updates and order-line foreign keys.
    await tx.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "productId" = ${productId} ORDER BY "id" FOR UPDATE`;
    const owned = await tx.productVariant.count({ where: { productId, id: { in: keep } } });
    if (owned !== keep.length) throw new BadRequestException('Alguna variante ya no existe o pertenece a otro producto. Vuelve a abrir la ficha.');
    const reserved = await tx.productVariant.count({ where: { productId, id: { notIn: keep }, orderItems: { some: { order: { stockState: 'held' } } } } });
    if (reserved) throw new ConflictException('Hay variantes reservadas en pedidos pendientes. Desactívalas y espera a que se liberen antes de eliminarlas.');
    // Permit changing/swapping existing option values without transient uniqueness collisions.
    await tx.productVariant.updateMany({ where: { productId }, data: { combinationKey: null } });
    await tx.productVariant.deleteMany({
      where: { productId, id: { notIn: keep } },
    });
    const newVariants: Prisma.ProductVariantCreateManyInput[] = [];
    for (const variant of variants) {
      const data = this.toVariantData(variant, stockless, basePriceCents);
      if (variant.id) {
        const { count } = await tx.productVariant.updateMany({
          where: { id: variant.id, productId, ...(variant.expectedStockQty !== undefined ? { stockQty: variant.expectedStockQty } : {}) },
          data,
        });
        if (!count) throw new ConflictException('El stock de una variante cambió mientras editabas. Vuelve a abrir el producto para guardar con el stock actualizado.');
        continue;
      }
      newVariants.push({ productId, ...data });
    }
    if (newVariants.length) await tx.productVariant.createMany({ data: newVariants });
  }

  private toVariantData(variant: ProductVariantInputDto, stockless = false, basePriceCents = variant.priceCents) {
    const options = variantOptions(variant);
    return {
      options: options as Prisma.InputJsonValue,
      combinationKey: combinationKey(options),
      priceInherited: variant.priceInherited ?? false,
      sku: variant.sku?.trim() || null,
      option1Name: options[0]?.name ?? null,
      option1Value: options[0]?.value ?? null,
      option2Name: options[1]?.name ?? null,
      option2Value: options[1]?.value ?? null,
      option3Name: options[2]?.name ?? null,
      option3Value: options[2]?.value ?? null,
      imageUrl: variant.imageUrl?.trim() || null,
      priceCents: variant.priceInherited ? basePriceCents : variant.priceCents,
      isAvailable: variant.isAvailable ?? true,
      stockQty: stockless ? null : (variant.stockQty ?? null),
    };
  }
}
