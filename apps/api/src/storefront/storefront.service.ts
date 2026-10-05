import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Storefront } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
import { sellerIdentityComplete } from './seller-identity';
import { shippingOptions } from './shipping';
import { ensureStorefront } from './storefront-row';
import { readTemplateContent, templateAllowed } from './store-templates';
import {
  customDomainUrl,
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  RESERVED_SLUGS,
  storefrontUrl,
} from './storefront-host';
import { createPreviewToken } from './storefront-preview';
import { activeCustomDomain, isIntegrationActive } from '../integrations/integration-state';

const SUBDOMAIN_CHANGES_PER_WINDOW = 3;
const SUBDOMAIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SUBDOMAIN_TAKEN = 'Esa dirección ya está en uso. Prueba con otra.';

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
  /** Platform-hosted original demos work even when the store uses a custom domain. */
  templateDemoBaseUrl: string;
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
    await this.assertEnabled(tenantId);
    const current = await this.ensure(tenantId);
    const industry = dto.industry ?? current.industry;
    let template = dto.template ?? current.template;
    if (!templateAllowed(template, industry)) {
      if (dto.template !== undefined) {
        throw new BadRequestException('Esa plantilla no está disponible para el rubro de tu negocio.');
      }
      template = 'classic';
    }
    const storefront = await this.prisma.storefront.update({
      where: { tenantId },
      data: {
        industry,
        template,
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
        sellerType: dto.sellerType,
        legalName: this.optionalText(dto.legalName),
        ruc: this.optionalText(dto.ruc),
        legalAddress: this.optionalText(dto.legalAddress),
        dni: this.optionalText(dto.dni),
        legalDistrict: this.optionalText(dto.legalDistrict),
        complaintsBookUrl: this.optionalText(dto.complaintsBookUrl),
        dataBankCode: this.optionalText(dto.dataBankCode),
        exchangeDays: dto.exchangeDays,
      },
    });
    return this.view(tenantId, storefront);
  }

  /**
   * Moves the store to a new subdomain. The previous one is kept as a redirect owned by this
   * tenant, so links already shared keep working and no other store can take it over.
   */
  async changeSubdomain(tenantId: string, slug: string): Promise<StorefrontSettingsView> {
    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException('Esa dirección está reservada. Elige otra.');
    }
    await this.assertEnabled(tenantId);
    const storefront = await this.ensure(tenantId);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (tenant.slug === slug) {
      return this.view(tenantId, storefront);
    }
    const recentChanges = await this.prisma.storeSlugRedirect.count({
      where: { tenantId, createdAt: { gte: new Date(Date.now() - SUBDOMAIN_WINDOW_MS) } },
    });
    if (recentChanges >= SUBDOMAIN_CHANGES_PER_WINDOW) {
      throw new BadRequestException(
        'Ya cambiaste la dirección de tu tienda varias veces este mes. Podrás cambiarla de nuevo en unos días.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.storeSlugRedirect.findUnique({ where: { slug } });
        if (claimed && claimed.tenantId !== tenantId) {
          throw new ConflictException(SUBDOMAIN_TAKEN);
        }
        if (claimed) {
          await tx.storeSlugRedirect.delete({ where: { slug } });
        }
        await tx.storeSlugRedirect.create({ data: { slug: tenant.slug, tenantId } });
        await tx.tenant.update({ where: { id: tenantId }, data: { slug } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(SUBDOMAIN_TAKEN);
      }
      throw error;
    }
    return this.view(tenantId, storefront);
  }

  async publish(tenantId: string): Promise<StorefrontSettingsView> {
    await this.assertEnabled(tenantId);
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
    await this.assertEnabled(tenantId);
    const storefront = await this.ensure(tenantId);
    await this.prisma.product.updateMany({
      where: { tenantId, isAvailable: true, isPublishedOnStore: false },
      data: { isPublishedOnStore: true },
    });
    return this.view(tenantId, storefront);
  }

  async previewLink(tenantId: string): Promise<{ url: string; expiresAt: Date }> {
    await this.assertEnabled(tenantId);
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

  private async assertEnabled(tenantId: string): Promise<void> {
    if (!(await isIntegrationActive(this.prisma, tenantId, 'store'))) {
      throw new ForbiddenException('Activa «Tienda web» en Integraciones para configurar y publicar tu tienda.');
    }
  }

  private ensure(tenantId: string): Promise<Storefront> {
    return ensureStorefront(this.prisma, tenantId);
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
        label:
          storefront.sellerType === 'INDIVIDUAL'
            ? 'Nombre completo, DNI y dirección'
            : 'Razón social, RUC y dirección',
        done: sellerIdentityComplete(storefront),
        required: true,
        impact:
          storefront.sellerType === 'INDIVIDUAL'
            ? 'La ley de protección al consumidor exige identificar al vendedor. En tu tienda solo se muestran tu nombre y tu distrito.'
            : 'La ley de protección al consumidor exige identificar al proveedor en la tienda.',
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
        impact: 'Se configuran en Envíos. El comprador elige cómo recibe su pedido y ve el costo antes de pagar.',
      },
      {
        id: 'logo',
        label: 'Logo',
        done: Boolean(readTemplateContent(storefront.templateContent).theme?.logo ?? storefront.logoUrl),
        required: false,
        impact: 'Súbelo en Editar diseño, pestaña Estilo. Aumenta la confianza y hace reconocible la marca.',
      },
      {
        id: 'seo',
        label: 'Descripción para Google',
        done: Boolean(storefront.seoDescription),
        required: false,
        impact: 'Mejora cómo aparece la tienda en buscadores y al compartir el enlace.',
      },
    ];
    const domain = await activeCustomDomain(this.prisma, tenantId);
    return {
      storefront,
      url: domain ? customDomainUrl(this.urlTemplate(), domain) : storefrontUrl(this.urlTemplate(), tenant.slug),
      templateDemoBaseUrl: new URL('/_templates/', storefrontUrl(this.urlTemplate(), tenant.slug)).toString(),
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
