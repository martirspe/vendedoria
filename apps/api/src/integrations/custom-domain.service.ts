import { resolveCname } from 'node:dns/promises';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { assertManager } from '../common/roles';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  customDomainUrl,
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  storefrontBaseDomain,
  storefrontUrl,
} from '../storefront/storefront-host';
import { CloudflareSaasClient } from './cloudflare-saas.client';
import { isIntegrationActive } from './integration-state';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MANAGER_MESSAGE = 'Solo el dueño o un administrador puede cambiar el dominio.';

export type CustomDomainStatus = 'none' | 'pending' | 'active' | 'failed';

export type CustomDomainView = {
  domain: string | null;
  status: CustomDomainStatus;
  /** Value of the CNAME record the business creates at its domain provider. */
  cnameTarget: string;
  /** Extra TXT record, only when Cloudflare asks for it. */
  ownershipRecord: { name: string; value: string } | null;
  /** Whether the domain's CNAME already points to cnameTarget; null when not checked. */
  dnsOk: boolean | null;
  checkedAt: string | null;
  storeUrl: string;
  subdomainUrl: string;
};

/** Lowercase hostname without scheme, path, port or trailing dot; null when it is not a domain. */
export function normalizeDomain(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (!value || value.length > 253) return null;
  const labels = value.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  return value;
}

@Injectable()
export class CustomDomainService {
  private readonly urlTemplate: string;
  private readonly baseDomain: string;
  private readonly consoleHosts: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cloudflare: CloudflareSaasClient,
  ) {
    this.urlTemplate = config.get<string>('STOREFRONT_URL_TEMPLATE') ?? DEFAULT_STOREFRONT_URL_TEMPLATE;
    this.baseDomain = storefrontBaseDomain(this.urlTemplate);
    this.consoleHosts = new Set(
      (config.get<string>('CORS_ORIGIN') ?? '')
        .split(',')
        .map((origin) => {
          try {
            return new URL(origin.trim()).hostname.toLowerCase();
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    );
  }

  /** Production needs Cloudflare for SaaS to issue certificates; development activates domains directly. */
  get available(): boolean {
    return this.cloudflare.configured || this.config.get<string>('NODE_ENV') !== 'production';
  }

  async get(tenantId: string): Promise<CustomDomainView> {
    const storefront = await this.storefront(tenantId);
    return this.view(storefront, null, null);
  }

  async set(user: AuthUserPayload, input: string): Promise<CustomDomainView> {
    assertManager(user, MANAGER_MESSAGE);
    await this.assertActive(user.tenantId);
    const domain = normalizeDomain(input);
    if (!domain) {
      throw new BadRequestException('Escribe un dominio válido, por ejemplo www.mitienda.pe.');
    }
    if (domain.split('.').length < 3) {
      throw new BadRequestException(
        `Usa un subdominio de tu dominio, por ejemplo www.${domain}. La mayoría de proveedores no permite apuntar el dominio sin «www».`,
      );
    }
    if (
      domain === this.baseDomain ||
      domain.endsWith(`.${this.baseDomain}`) ||
      this.consoleHosts.has(domain)
    ) {
      throw new BadRequestException('Ese dominio pertenece a VendedorIA. Usa un dominio tuyo.');
    }

    const current = await this.storefront(user.tenantId);
    if (current.customDomain === domain) {
      return this.view(current, null, null);
    }
    if (current.customDomainProviderId) {
      await this.cloudflare.remove(current.customDomainProviderId);
    }
    const created = this.cloudflare.configured ? await this.cloudflare.create(domain) : null;
    if (this.cloudflare.configured && !created) {
      throw new BadRequestException(
        'No pudimos registrar tu dominio en este momento. Revisa que esté bien escrito e inténtalo de nuevo.',
      );
    }
    try {
      const updated = await this.prisma.storefront.update({
        where: { tenantId: user.tenantId },
        data: {
          customDomain: domain,
          customDomainStatus: 'pending',
          customDomainProviderId: created?.id ?? null,
          customDomainCheckedAt: null,
        },
        include: { tenant: { select: { slug: true } } },
      });
      return this.view(updated, created?.ownershipRecord ?? null, null);
    } catch (error) {
      if (created) await this.cloudflare.remove(created.id);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ese dominio ya está conectado a otra tienda.');
      }
      throw error;
    }
  }

  /** Checks DNS and the certificate; the store starts answering on the domain once it is active. */
  async verify(user: AuthUserPayload): Promise<CustomDomainView> {
    assertManager(user, MANAGER_MESSAGE);
    await this.assertActive(user.tenantId);
    const storefront = await this.storefront(user.tenantId);
    if (!storefront.customDomain) {
      throw new BadRequestException('Primero escribe tu dominio.');
    }
    const target = this.cnameTarget(storefront.tenant.slug);
    const dnsOk = await this.pointsTo(storefront.customDomain, target);

    let status: CustomDomainStatus;
    let ownershipRecord: CustomDomainView['ownershipRecord'] = null;
    let providerId = storefront.customDomainProviderId;
    if (this.cloudflare.configured) {
      let state = providerId ? await this.cloudflare.get(providerId) : null;
      if (!state) {
        state = await this.cloudflare.create(storefront.customDomain);
        providerId = state?.id ?? null;
      }
      ownershipRecord = state?.ownershipRecord ?? null;
      status = !state
        ? 'pending'
        : state.status === 'active' && state.sslStatus === 'active'
          ? 'active'
          : ['moved', 'deleted', 'blocked'].includes(state.status)
            ? 'failed'
            : 'pending';
    } else if (this.config.get<string>('NODE_ENV') === 'production') {
      status = 'pending';
    } else {
      status = 'active';
    }

    const updated = await this.prisma.storefront.update({
      where: { tenantId: user.tenantId },
      data: {
        customDomainStatus: status,
        customDomainProviderId: providerId,
        customDomainCheckedAt: new Date(),
      },
      include: { tenant: { select: { slug: true } } },
    });
    return this.view(updated, ownershipRecord, dnsOk);
  }

  async remove(user: AuthUserPayload): Promise<CustomDomainView> {
    assertManager(user, MANAGER_MESSAGE);
    await this.clear(user.tenantId);
    return this.get(user.tenantId);
  }

  /** Also used when the integration is turned off. */
  async clear(tenantId: string): Promise<void> {
    const storefront = await this.prisma.storefront.findUnique({
      where: { tenantId },
      select: { customDomainProviderId: true },
    });
    if (!storefront) return;
    if (storefront.customDomainProviderId) {
      await this.cloudflare.remove(storefront.customDomainProviderId);
    }
    await this.prisma.storefront.update({
      where: { tenantId },
      data: {
        customDomain: null,
        customDomainStatus: null,
        customDomainProviderId: null,
        customDomainCheckedAt: null,
      },
    });
  }

  private async assertActive(tenantId: string): Promise<void> {
    if (!(await isIntegrationActive(this.prisma, tenantId, 'custom_domain'))) {
      throw new ForbiddenException('Activa «Tienda web» y «Dominio propio» en Integraciones para conectar tu dominio.');
    }
  }

  private async storefront(tenantId: string) {
    const existing = await this.prisma.storefront.findUnique({
      where: { tenantId },
      include: { tenant: { select: { slug: true } } },
    });
    if (existing) return existing;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    return this.prisma.storefront.upsert({
      where: { tenantId },
      create: { tenantId, displayName: tenant.name },
      update: {},
      include: { tenant: { select: { slug: true } } },
    });
  }

  /** Platform CNAME target with Cloudflare for SaaS; otherwise the store's own subdomain. */
  private cnameTarget(slug: string): string {
    const configured = this.config.get<string>('CUSTOM_DOMAIN_CNAME_TARGET')?.trim().toLowerCase();
    return configured || new URL(storefrontUrl(this.urlTemplate, slug)).hostname;
  }

  private async pointsTo(domain: string, target: string): Promise<boolean | null> {
    try {
      const records = await resolveCname(domain);
      return records.some((record) => record.toLowerCase().replace(/\.$/, '') === target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code === 'ENODATA' || code === 'ENOTFOUND' ? false : null;
    }
  }

  private view(
    storefront: {
      customDomain: string | null;
      customDomainStatus: string | null;
      customDomainCheckedAt: Date | null;
      tenant: { slug: string };
    },
    ownershipRecord: CustomDomainView['ownershipRecord'],
    dnsOk: boolean | null,
  ): CustomDomainView {
    const subdomainUrl = storefrontUrl(this.urlTemplate, storefront.tenant.slug);
    const status = (storefront.customDomain ? storefront.customDomainStatus ?? 'pending' : 'none') as CustomDomainStatus;
    return {
      domain: storefront.customDomain,
      status,
      cnameTarget: this.cnameTarget(storefront.tenant.slug),
      ownershipRecord,
      dnsOk,
      checkedAt: storefront.customDomainCheckedAt?.toISOString() ?? null,
      storeUrl:
        status === 'active' && storefront.customDomain
          ? customDomainUrl(this.urlTemplate, storefront.customDomain)
          : subdomainUrl,
      subdomainUrl,
    };
  }
}
