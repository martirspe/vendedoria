import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId },
      include: { variants: true, media: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(tenantId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
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
      },
    });
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
}
