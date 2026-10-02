import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Storefront } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findUbigeo } from '../ubigeo/ubigeo';
import { RUC, UpdateStorefrontDto } from './dto/update-storefront.dto';
import { shippingOptions } from './shipping';
import { readTemplateCopy, templateAllowed } from './store-templates';
import {
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  storefrontUrl,
} from './storefront-host';
import { createPreviewToken } from './storefront-preview';

export type StorefrontChecklistItem = {
  id:
    | 'name'
    | 'whatsapp'
    | 'products'
    | 'legal'
    | 'complaints'
    | 'email'
    | 'delivery'
    | 'logo'
    | 'seo';
  label: string;
  done: boolean;
  required: boolean;
  impact: string;
};

export type StorefrontSettingsView = {
  storefront: Storefront;
  url: string;
  totalProducts: number;
  publishedProducts: number;
  availableProducts: number;
  checklist: StorefrontChecklistItem[];
  canPublish: boolean;
};

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(tenantId: string): Promise<StorefrontSettingsView> {
    const storefront = await this.ensure(tenantId);
    return this.view(tenantId, storefront);
  }

  async update(
    tenantId: string,
    dto: UpdateStorefrontDto,
  ): Promise<StorefrontSettingsView> {
    const current = await this.ensure(tenantId);
    const industry = dto.industry ?? current.industry;
    let template = dto.template ?? current.template;
    if (!templateAllowed(template, industry)) {
      if (dto.template !== undefined) {
        throw new BadRequestException('Esa plantilla no está disponible para el rubro de tu negocio.');
      }
      template = 'classic';
    }
    if (dto.shippingOriginUbigeo && !findUbigeo(dto.shippingOriginUbigeo)) {
      throw new BadRequestException('Elige un distrito de origen válido.');
    }
    const storefront = await this.prisma.storefront.update({
      where: { tenantId },
      data: {
        industry,
        template,
        ...(dto.templateCopy !== undefined
          ? {
              templateCopy: dto.templateCopy
                ? (readTemplateCopy(dto.templateCopy as Prisma.JsonObject) as Prisma.JsonObject)
                : Prisma.DbNull,
            }
          : {}),
        ...(dto.carrierRates !== undefined
          ? {
              carrierRates: dto.carrierRates
                ? ({
                    ...(dto.carrierRates.olva ? { olva: dto.carrierRates.olva } : {}),
                    ...(dto.carrierRates.shalom ? { shalom: dto.carrierRates.shalom } : {}),
                  } as Prisma.JsonObject)
                : Prisma.DbNull,
            }
          : {}),
        shippingOriginUbigeo: this.optionalText(dto.shippingOriginUbigeo),
        displayName: dto.displayName?.trim(),
        tagline: this.optionalText(dto.tagline),
        logoUrl: this.optionalText(dto.logoUrl),
        heroImageUrl: this.optionalText(dto.heroImageUrl),
        brandColor: dto.brandColor?.toLowerCase(),
        accentColor: dto.accentColor?.toLowerCase(),
        whatsappPhone: this.optionalText(dto.whatsappPhone),
        contactEmail: this.optionalText(dto.contactEmail)?.toLowerCase(),
        seoTitle: this.optionalText(dto.seoTitle),
        seoDescription: this.optionalText(dto.seoDescription),
        legalName: this.optionalText(dto.legalName),
        ruc: this.optionalText(dto.ruc),
        legalAddress: this.optionalText(dto.legalAddress),
        complaintsBookUrl: this.optionalText(dto.complaintsBookUrl),
        dataBankCode: this.optionalText(dto.dataBankCode),
        exchangeDays: dto.exchangeDays,
        deliveryEnabled: dto.deliveryEnabled,
        freeShippingFromCents: dto.freeShippingFromCents,
        pickupEnabled: dto.pickupEnabled,
        pickupAddress: this.optionalText(dto.pickupAddress),
      },
    });
    return this.view(tenantId, storefront);
  }

  async publish(tenantId: string): Promise<StorefrontSettingsView> {
    const current = await this.get(tenantId);
    if (!current.canPublish) {
      const missing = current.checklist
        .filter((item) => item.required && !item.done)
        .map((item) => item.label);
      throw new BadRequestException(
        `Completa antes de publicar: ${missing.join(', ')}`,
      );
    }
    const storefront = await this.prisma.storefront.update({
      where: { tenantId },
      data: {
        status: 'PUBLISHED',
        publishedAt: current.storefront.publishedAt ?? new Date(),
      },
    });
    return this.view(tenantId, storefront);
  }

  async unpublish(tenantId: string): Promise<StorefrontSettingsView> {
    await this.ensure(tenantId);
    const storefront = await this.prisma.storefront.update({
      where: { tenantId },
      data: { status: 'DRAFT' },
    });
    return this.view(tenantId, storefront);
  }

  async showAvailableProducts(tenantId: string): Promise<StorefrontSettingsView> {
    const storefront = await this.ensure(tenantId);
    await this.prisma.product.updateMany({
      where: { tenantId, isAvailable: true, isPublishedOnStore: false },
      data: { isPublishedOnStore: true },
    });
    return this.view(tenantId, storefront);
  }

  async previewLink(tenantId: string): Promise<{ url: string; expiresAt: Date }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { slug: true },
    });
    await this.ensure(tenantId);
    const { token, expiresAt } = createPreviewToken(
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      tenantId,
    );
    const url = new URL(storefrontUrl(this.urlTemplate(), tenant.slug));
    url.searchParams.set('preview', token);
    return { url: url.toString(), expiresAt };
  }

  private async ensure(tenantId: string): Promise<Storefront> {
    const existing = await this.prisma.storefront.findUnique({
      where: { tenantId },
    });
    if (existing) {
      return existing;
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    return this.prisma.storefront.upsert({
      where: { tenantId },
      create: { tenantId, displayName: tenant.name },
      update: {},
    });
  }

  private async view(
    tenantId: string,
    storefront: Storefront,
  ): Promise<StorefrontSettingsView> {
    const [tenant, totalProducts, publishedProducts, availableProducts] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { slug: true },
      }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.count({
        where: { tenantId, isPublishedOnStore: true },
      }),
      this.prisma.product.count({
        where: { tenantId, isPublishedOnStore: true, isAvailable: true },
      }),
    ]);
    const checklist: StorefrontChecklistItem[] = [
      {
        id: 'name',
        label: 'Nombre de la tienda',
        done: storefront.displayName.trim().length >= 2,
        required: true,
        impact: 'Es lo primero que ve el comprador y el título en Google.',
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp de ventas',
        done: Boolean(storefront.whatsappPhone),
        required: true,
        impact: 'Los botones de compra y consulta abren este número con tu vendedor IA.',
      },
      {
        id: 'products',
        label: 'Al menos un producto visible y disponible',
        done: availableProducts > 0,
        required: true,
        impact: 'Una tienda sin productos disponibles no puede vender.',
      },
      {
        id: 'legal',
        label: 'Razón social, RUC y dirección',
        done: Boolean(
          storefront.legalName &&
            storefront.ruc &&
            RUC.test(storefront.ruc) &&
            storefront.legalAddress,
        ),
        required: true,
        impact: 'La ley de protección al consumidor exige identificar al proveedor en la tienda.',
      },
      {
        id: 'complaints',
        label: 'Libro de Reclamaciones virtual',
        done: Boolean(storefront.complaintsBookUrl),
        required: true,
        impact: 'Obligatorio para vender online en Perú; se enlaza en el pie de página.',
      },
      {
        id: 'email',
        label: 'Correo de contacto',
        done: Boolean(storefront.contactEmail),
        required: true,
        impact: 'Canal formal para reclamos, devoluciones y derechos sobre datos personales.',
      },
      {
        id: 'delivery',
        label: 'Formas de entrega',
        done: shippingOptions(storefront).length > 0,
        required: true,
        impact: 'El comprador elige cómo recibe su pedido y ve el costo antes de pagar.',
      },
      {
        id: 'logo',
        label: 'Logo',
        done: Boolean(storefront.logoUrl),
        required: false,
        impact: 'Aumenta la confianza y hace reconocible la marca.',
      },
      {
        id: 'seo',
        label: 'Descripción para Google',
        done: Boolean(storefront.seoDescription),
        required: false,
        impact: 'Mejora cómo aparece la tienda en buscadores y al compartir el enlace.',
      },
    ];
    return {
      storefront,
      url: storefrontUrl(this.urlTemplate(), tenant.slug),
      totalProducts,
      publishedProducts,
      availableProducts,
      checklist,
      canPublish: checklist.every((item) => !item.required || item.done),
    };
  }

  private optionalText(value: string | null | undefined): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private urlTemplate(): string {
    return (
      this.config.get<string>('STOREFRONT_URL_TEMPLATE') ??
      DEFAULT_STOREFRONT_URL_TEMPLATE
    );
  }
}
