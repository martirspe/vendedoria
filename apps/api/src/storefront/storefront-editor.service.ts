import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Storefront } from '@prisma/client';
import type {
  StoreEditorSection,
  StoreEditorTheme,
  StoreTemplate,
  StoreTemplateContent,
} from '@vendedoria/contracts';
import { MediaService } from '../catalog/media.service';
import { isIntegrationActive } from '../integrations/integration-state';
import { PrismaService } from '../prisma/prisma.service';
import {
  TEMPLATE_SECTIONS,
  TEMPLATE_THEME_OPTIONS,
  contentImages,
  effectiveTemplate,
  readTemplateContent,
  sameContent,
  sanitizeContent,
  themeDefaults,
} from './store-templates';
import {
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  storefrontUrl,
} from './storefront-host';
import { createPreviewToken } from './storefront-preview';
import { ensureStorefront } from './storefront-row';

/** Query parameter the store server reads to render the page in edit mode. */
export const EDITOR_QUERY = 'editor';
/** Replaced versions kept per store; older ones are deleted on publish. */
export const MAX_VERSIONS = 20;
const SCHEDULE_SWEEP_MS = 60_000;
const MIN_SCHEDULE_MS = 5 * 60_000;
const MAX_SCHEDULE_MS = 90 * 24 * 60 * 60_000;

export type StoreEditorState = {
  /** Content being edited: the draft, or the published content when there is no draft. */
  content: StoreTemplateContent;
  hasUnpublishedChanges: boolean;
  /** The draft is published automatically at this time. */
  scheduledAt: string | null;
  savedAt: string;
};

export type StoreEditorView = StoreEditorState & {
  template: StoreTemplate;
  sections: StoreEditorSection[];
  theme: StoreEditorTheme;
  storeStatus: Storefront['status'];
  /** Store home in edit mode, signed for this tenant like a preview link. */
  frameUrl: string;
  frameExpiresAt: string;
  /** Texts can be drafted with AI (an OpenAI key is configured). */
  aiText: boolean;
};

/** Content that was published until `replacedAt`. */
export type StoreEditorVersion = { id: string; replacedAt: string };

@Injectable()
export class StorefrontEditorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorefrontEditorService.name);
  private sweep?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly media: MediaService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.sweep = setInterval(() => {
      this.publishScheduled().catch((error: unknown) =>
        this.logger.error(
          `Scheduled publish sweep failed: ${(error as Error).message}`,
        ),
      );
    }, SCHEDULE_SWEEP_MS);
    this.sweep.unref();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  async get(tenantId: string): Promise<StoreEditorView> {
    await this.assertEnabled(tenantId);
    const [storefront, tenant] = await Promise.all([
      ensureStorefront(this.prisma, tenantId),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { slug: true },
      }),
    ]);
    const template = effectiveTemplate(
      storefront.template,
      storefront.industry,
    );
    const { token, expiresAt } = createPreviewToken(
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      tenantId,
    );
    const frame = new URL(storefrontUrl(this.urlTemplate(), tenant.slug));
    frame.searchParams.set(EDITOR_QUERY, token);
    return {
      ...this.state(storefront),
      template,
      sections: TEMPLATE_SECTIONS[template],
      theme: {
        options: TEMPLATE_THEME_OPTIONS[template],
        defaults: themeDefaults(template, storefront),
      },
      storeStatus: storefront.status,
      frameUrl: frame.toString(),
      frameExpiresAt: expiresAt.toISOString(),
      aiText: Boolean(this.config.get<string>('OPENAI_API_KEY')),
    };
  }

  /** Autosave target. Content equal to the published one clears the draft (and its schedule). */
  async saveDraft(tenantId: string, value: unknown): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const published = readTemplateContent(storefront.templateContent);
    const known = new Set([
      ...contentImages(published),
      ...contentImages(readTemplateContent(storefront.templateDraft)),
      ...(storefront.heroImageUrl ? [storefront.heroImageUrl] : []),
      ...(storefront.logoUrl ? [storefront.logoUrl] : []),
    ]);
    const draft = sanitizeContent(
      value,
      (url) => known.has(url) || this.media.isOwnUpload(tenantId, url),
    );
    return this.state(await this.writeDraft(tenantId, draft, published));
  }

  async publish(tenantId: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    await ensureStorefront(this.prisma, tenantId);
    await this.publishDraft(tenantId);
    return this.state(
      await this.prisma.storefront.findUniqueOrThrow({ where: { tenantId } }),
    );
  }

  async discard(tenantId: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    await ensureStorefront(this.prisma, tenantId);
    const updated = await this.prisma.storefront.update({
      where: { tenantId },
      data: { templateDraft: Prisma.DbNull, templatePublishAt: null },
    });
    return this.state(updated);
  }

  async versions(tenantId: string): Promise<StoreEditorVersion[]> {
    await this.assertEnabled(tenantId);
    const rows = await this.prisma.storefrontVersion.findMany({
      where: { tenantId },
      orderBy: { replacedAt: 'desc' },
      take: MAX_VERSIONS,
      select: { id: true, replacedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      replacedAt: row.replacedAt.toISOString(),
    }));
  }

  /** Loads a previous version into the draft; the merchant reviews it and publishes. */
  async restore(
    tenantId: string,
    versionId: string,
  ): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const version = await this.prisma.storefrontVersion.findFirst({
      where: { id: versionId, tenantId },
    });
    if (!version)
      throw new NotFoundException('Esa versión ya no está disponible.');
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const published = readTemplateContent(storefront.templateContent);
    return this.state(
      await this.writeDraft(
        tenantId,
        readTemplateContent(version.content),
        published,
      ),
    );
  }

  async schedule(tenantId: string, publishAt: Date): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const wait = publishAt.getTime() - Date.now();
    if (wait < MIN_SCHEDULE_MS || wait > MAX_SCHEDULE_MS) {
      throw new BadRequestException(
        'Elige una fecha entre 5 minutos y 90 días desde ahora.',
      );
    }
    const storefront = await ensureStorefront(this.prisma, tenantId);
    if (!this.state(storefront).hasUnpublishedChanges) {
      throw new BadRequestException(
        'No hay cambios sin publicar para programar.',
      );
    }
    const updated = await this.prisma.storefront.update({
      where: { tenantId },
      data: { templatePublishAt: publishAt },
    });
    return this.state(updated);
  }

  async cancelSchedule(tenantId: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    await ensureStorefront(this.prisma, tenantId);
    const updated = await this.prisma.storefront.update({
      where: { tenantId },
      data: { templatePublishAt: null },
    });
    return this.state(updated);
  }

  /** Publishes the drafts whose time has come; stores with the integration off just lose the schedule. */
  async publishScheduled(now = new Date()): Promise<number> {
    const due = await this.prisma.storefront.findMany({
      where: { templatePublishAt: { lte: now } },
      select: { tenantId: true },
      take: 50,
    });
    let published = 0;
    for (const { tenantId } of due) {
      if (await isIntegrationActive(this.prisma, tenantId, 'store')) {
        if (await this.publishDraft(tenantId)) published++;
      } else {
        await this.prisma.storefront.update({
          where: { tenantId },
          data: { templatePublishAt: null },
        });
      }
    }
    return published;
  }

  private writeDraft(
    tenantId: string,
    draft: StoreTemplateContent,
    published: StoreTemplateContent,
  ): Promise<Storefront> {
    const same = sameContent(draft, published);
    return this.prisma.storefront.update({
      where: { tenantId },
      data: same
        ? { templateDraft: Prisma.DbNull, templatePublishAt: null }
        : { templateDraft: draft as Prisma.JsonObject },
    });
  }

  /**
   * Draft → published, keeping the replaced content as a version. The row is claimed by its
   * `updatedAt`, so a manual publish and the schedule sweep never publish the same draft twice.
   */
  private publishDraft(tenantId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const storefront = await tx.storefront.findUniqueOrThrow({
        where: { tenantId },
      });
      if (!storefront.templateDraft) {
        if (storefront.templatePublishAt) {
          await tx.storefront.update({
            where: { tenantId },
            data: { templatePublishAt: null },
          });
        }
        return false;
      }
      const previous = readTemplateContent(storefront.templateContent);
      const claimed = await tx.storefront.updateMany({
        where: { tenantId, updatedAt: storefront.updatedAt },
        data: {
          templateContent: readTemplateContent(storefront.templateDraft),
          templateDraft: Prisma.DbNull,
          templatePublishAt: null,
        },
      });
      if (claimed.count === 0) return false;
      await tx.storefrontVersion.create({
        data: { tenantId, content: previous },
      });
      const stale = await tx.storefrontVersion.findMany({
        where: { tenantId },
        orderBy: { replacedAt: 'desc' },
        skip: MAX_VERSIONS,
        select: { id: true },
      });
      if (stale.length) {
        await tx.storefrontVersion.deleteMany({
          where: { tenantId, id: { in: stale.map((v) => v.id) } },
        });
      }
      return true;
    });
  }

  private state(storefront: Storefront): StoreEditorState {
    const published = readTemplateContent(storefront.templateContent);
    const draft = storefront.templateDraft
      ? readTemplateContent(storefront.templateDraft)
      : null;
    const pending = Boolean(draft && !sameContent(draft, published));
    return {
      content: draft ?? published,
      hasUnpublishedChanges: pending,
      scheduledAt:
        pending && storefront.templatePublishAt
          ? storefront.templatePublishAt.toISOString()
          : null,
      savedAt: storefront.updatedAt.toISOString(),
    };
  }

  private async assertEnabled(tenantId: string): Promise<void> {
    if (!(await isIntegrationActive(this.prisma, tenantId, 'store'))) {
      throw new ForbiddenException(
        'Activa «Tienda web» en Integraciones para editar tu tienda.',
      );
    }
  }

  private urlTemplate(): string {
    return (
      this.config.get<string>('STOREFRONT_URL_TEMPLATE') ??
      DEFAULT_STOREFRONT_URL_TEMPLATE
    );
  }
}
