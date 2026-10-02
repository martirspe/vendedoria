import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  ProductVariantInputDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  list(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId },
      include: { variants: true, media: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateProductDto) {
    await this.planLimits.assertCanCreateProduct(tenantId);
    try {
      return await this.prisma.product.create({
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
          stockUnlimited: dto.stockUnlimited ?? true,
          stockQty: dto.stockQty,
          isPublishedOnStore: dto.isPublishedOnStore ?? false,
          compareAtPriceCents: dto.compareAtPriceCents ?? null,
          brand: dto.brand?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
          seoTitle: dto.seoTitle?.trim() || null,
          seoDescription: dto.seoDescription?.trim() || null,
          variants: dto.variants?.length
            ? {
                create: dto.variants.map((variant) =>
                  this.toVariantData(variant),
                ),
              }
            : undefined,
          media: dto.mediaUrls?.length
            ? {
                create: dto.mediaUrls
                  .map((url) => url.trim())
                  .filter(Boolean)
                  .slice(0, 8)
                  .map((url, index) => ({
                    url,
                    kind: 'image',
                    sortOrder: index,
                  })),
              }
            : undefined,
        },
        include: { variants: true, media: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product handle already exists');
      }
      throw error;
    }
  }

  async update(tenantId: string, productId: string, dto: UpdateProductDto) {
    await this.getById(tenantId, productId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.variants) {
          await tx.productVariant.deleteMany({ where: { productId } });
          if (dto.variants.length) {
            await tx.productVariant.createMany({
              data: dto.variants.map((variant) => ({
                productId,
                ...this.toVariantData(variant),
              })),
            });
          }
        }

        if (dto.mediaUrls) {
          await tx.productMedia.deleteMany({ where: { productId } });
          const urls = dto.mediaUrls
            .map((url) => url.trim())
            .filter(Boolean)
            .slice(0, 8);
          if (urls.length) {
            await tx.productMedia.createMany({
              data: urls.map((url, index) => ({
                productId,
                url,
                kind: 'image',
                sortOrder: index,
              })),
            });
          }
        }

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
            stockUnlimited: dto.stockUnlimited,
            stockQty: dto.stockQty === null ? null : dto.stockQty,
            isPublishedOnStore: dto.isPublishedOnStore,
            compareAtPriceCents: dto.compareAtPriceCents,
            brand: this.optionalText(dto.brand),
            sortOrder: dto.sortOrder,
            seoTitle: this.optionalText(dto.seoTitle),
            seoDescription: this.optionalText(dto.seoDescription),
          },
          include: { variants: true, media: true },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product handle already exists');
      }
      throw error;
    }
  }

  async getById(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: { variants: true, media: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private optionalText(value: string | null | undefined) {
    if (value === undefined) {
      return undefined;
    }
    return value?.trim() || null;
  }

  private toVariantData(variant: ProductVariantInputDto) {
    return {
      sku: variant.sku,
      option1Name: variant.option1Name,
      option1Value: variant.option1Value,
      option2Name: variant.option2Name,
      option2Value: variant.option2Value,
      priceCents: variant.priceCents,
      isAvailable: variant.isAvailable ?? true,
      stockQty: variant.stockQty ?? null,
    };
  }
}
