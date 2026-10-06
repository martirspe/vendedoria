import {
  BadRequestException,
  ConflictException,
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
  StoreLayoutItem,
  StoreTemplate,
  StoreTemplateContent,
} from '@vendedoria/contracts';
import { MediaService } from '../catalog/media.service';
import { getTheme, THEME_CATALOG, THEME_ENVIRONMENT, importPreset, migrateContent } from '@vendedoria/themes';
import { isIntegrationActive } from '../integrations/integration-state';
import { PrismaService } from '../prisma/prisma.service';
import {
  contentImages,
  readTemplateContent,
  sameContent,
  sanitizeContent,
  themeDefaults,
  sectionsFor,
} from './store-templates';
import { assertContentVersion, assertTheme, selection, themeStatus, type ThemeStatus } from './theme-release';
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
  template: string;
  themeVersion: string;
  /** Content being edited: the draft, or the published content when there is no draft. */
  content: StoreTemplateContent;
  hasUnpublishedChanges: boolean;
  /** The draft is published automatically at this time. */
  scheduledAt: string | null;
  savedAt: string;
};

export type StoreEditorView = StoreEditorState & {
  themeStatus: ThemeStatus;
  template: StoreTemplate;
  sections: StoreEditorSection[];
  defaultLayout: StoreLayoutItem[];
  theme: StoreEditorTheme;
  storeStatus: Storefront['status'];
  /** Store home in edit mode, signed for this tenant like a preview link. */
  frameUrl: string;
  frameExpiresAt: string;
  /** Texts can be drafted with AI (an OpenAI key is configured). */
  aiText: boolean;
};

/** Content that was published until `replacedAt`. */
export type StoreEditorVersion = { id: string; replacedAt: string; template: string | null; themeVersion: string | null };

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
    const { template, version } = selection(storefront, true);
    const manifest = getTheme(template, version);
    const { token, expiresAt } = createPreviewToken(
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      tenantId,
    );
    const frame = new URL(storefrontUrl(this.urlTemplate(), tenant.slug));
    frame.searchParams.set(EDITOR_QUERY, token);
    return {
      ...this.state(storefront),
      template,
      themeStatus: themeStatus(storefront),
      sections: sectionsFor(template, version),
      defaultLayout: manifest?.presets[0].layout ?? [],
      theme: {
        options: manifest?.settings ?? [],
        defaults: themeDefaults(template, storefront, version),
      },
      storeStatus: storefront.status,
      frameUrl: frame.toString(),
      frameExpiresAt: expiresAt.toISOString(),
      aiText: Boolean(this.config.get<string>('OPENAI_API_KEY')),
    };
  }

  /** Autosave target. Content equal to the published one clears the draft (and its schedule). */
  async saveDraft(tenantId: string, value: unknown, savedAt?: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const storefront = await ensureStorefront(this.prisma, tenantId);
    assertContentVersion(value);
    assertContentVersion(storefront.templateContent);
    assertContentVersion(storefront.templateDraft);
    const chosen = selection(storefront, true);
    assertTheme(chosen.template, chosen.version, storefront.industry);
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
    return this.state(await this.writeDraft(tenantId, draft, published, storefront, savedAt));
  }

  async themes(tenantId: string) {
    await this.assertEnabled(tenantId);
    const store = await ensureStorefront(this.prisma, tenantId);
    return { status: themeStatus(store), savedAt: store.updatedAt.toISOString(), themes: THEME_CATALOG };
  }

  /** Install/select/update only prepares a draft; commerce records never participate. */
  async stageTheme(tenantId: string, template: string, version: string, preset?: string, savedAt?: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const store = await ensureStorefront(this.prisma, tenantId);
    assertContentVersion(store.templateContent);
    assertContentVersion(store.templateDraft);
    let manifest: ReturnType<typeof assertTheme>;
    try { manifest = assertTheme(template, version, store.industry); }
    catch (error) {
      this.trace('stage', getTheme(template, version)?.id ?? template, version, 'compatibility_rejected');
      throw error;
    }
    const current = selection(store, true);
    let content = readTemplateContent(store.templateDraft ?? store.templateContent);
    try {
      if (current.template === template && current.version !== version && getTheme(current.template, current.version)) {
        content = migrateContent(content, template, current.version, version);
      }
      if (preset) content = importPreset(content, manifest, preset);
    } catch (error) {
      this.trace('stage', manifest.id, version, 'migration_rejected');
      throw new BadRequestException((error as Error).message);
    }
    const updated = await this.writeDraft(tenantId, sanitizeContent(content), readTemplateContent(store.templateContent), store, savedAt, { template, version });
    this.trace('stage', manifest.id, version, 'draft_ready');
    return this.state(updated);
  }

  async publish(tenantId: string, savedAt?: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    await ensureStorefront(this.prisma, tenantId);
    await this.publishDraft(tenantId, savedAt);
    return this.state(
      await this.prisma.storefront.findUniqueOrThrow({ where: { tenantId } }),
    );
  }

  async discard(tenantId: string, savedAt?: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const store = await ensureStorefront(this.prisma, tenantId);
    const updated = await this.updateRevision(store, savedAt, { templateDraft: Prisma.DbNull, templatePublishAt: null, themeDraftTemplate: null, themeDraftVersion: null });
    return this.state(updated);
  }

  async versions(tenantId: string): Promise<StoreEditorVersion[]> {
    await this.assertEnabled(tenantId);
    const rows = await this.prisma.storefrontVersion.findMany({
      where: { tenantId },
      orderBy: { replacedAt: 'desc' },
      take: MAX_VERSIONS,
      select: { id: true, replacedAt: true, template: true, themeVersion: true },
    });
    return rows.map((row) => ({
      id: row.id,
      replacedAt: row.replacedAt.toISOString(),
      template: row.template,
      themeVersion: row.themeVersion,
    }));
  }

  /** Loads a previous version into the draft; the merchant reviews it and publishes. */
  async restore(
    tenantId: string,
    versionId: string,
    savedAt?: string,
  ): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const version = await this.prisma.storefrontVersion.findFirst({
      where: { id: versionId, tenantId },
    });
    if (!version)
      throw new NotFoundException('Esa versión ya no está disponible.');
    const storefront = await ensureStorefront(this.prisma, tenantId);
    assertContentVersion(version.content);
    const chosen = version.template && version.themeVersion
      ? { template: version.template, version: version.themeVersion }
      : selection(storefront);
    assertTheme(chosen.template, chosen.version, storefront.industry);
    const published = readTemplateContent(storefront.templateContent);
    return this.state(
      await this.writeDraft(
        tenantId,
        readTemplateContent(version.content),
        published,
        storefront,
        savedAt,
        chosen,
      ),
    );
  }

  async schedule(tenantId: string, publishAt: Date, savedAt?: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const wait = publishAt.getTime() - Date.now();
    if (wait < MIN_SCHEDULE_MS || wait > MAX_SCHEDULE_MS) {
      throw new BadRequestException(
        'Elige una fecha entre 5 minutos y 90 días desde ahora.',
      );
    }
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const chosen = selection(storefront, true);
    assertTheme(chosen.template, chosen.version, storefront.industry);
    assertContentVersion(storefront.templateContent);
    assertContentVersion(storefront.templateDraft);
    if (!this.state(storefront).hasUnpublishedChanges) {
      throw new BadRequestException(
        'No hay cambios sin publicar para programar.',
      );
    }
    const updated = await this.updateRevision(storefront, savedAt, { templatePublishAt: publishAt });
    return this.state(updated);
  }

  async cancelSchedule(tenantId: string, savedAt?: string): Promise<StoreEditorState> {
    await this.assertEnabled(tenantId);
    const store = await ensureStorefront(this.prisma, tenantId);
    const updated = await this.updateRevision(store, savedAt, { templatePublishAt: null });
    return this.state(updated);
  }

  /** Publishes the drafts whose time has come; stores with the integration off just lose the schedule. */
  async publishScheduled(now = new Date()): Promise<number> {
    const due = await this.prisma.storefront.findMany({
      where: { templatePublishAt: { lte: now } },
      select: { tenantId: true, template: true, themeVersion: true, themeDraftTemplate: true, themeDraftVersion: true },
      take: 50,
    });
    let published = 0;
    for (const row of due) {
      const { tenantId } = row;
      if (await isIntegrationActive(this.prisma, tenantId, 'store')) {
        try { if (await this.publishDraft(tenantId, undefined, now)) published++; }
        catch {
          const template = row.themeDraftTemplate ?? row.template;
          const version = row.themeDraftVersion ?? row.themeVersion;
          this.logger.warn(JSON.stringify({ event: 'theme_operation', operation: 'scheduled_publish', themeId: getTheme(template, version)?.id ?? template, version, outcome: 'rejected', contracts: THEME_ENVIRONMENT.contracts }));
        }
      } else {
        await this.prisma.storefront.updateMany({
          where: { tenantId, templatePublishAt: { lte: now } },
          data: { templatePublishAt: null },
        });
      }
    }
    return published;
  }

  private async writeDraft(
    tenantId: string,
    draft: StoreTemplateContent,
    published: StoreTemplateContent,
    store: Storefront,
    savedAt?: string,
    chosen = selection(store, true),
  ): Promise<Storefront> {
    const same = sameContent(draft, published);
    const sameTheme = chosen.template === store.template && chosen.version === store.themeVersion;
    return this.updateRevision(store, savedAt, {
      templateDraft: same ? Prisma.DbNull : draft as Prisma.JsonObject,
      ...(!same && sameTheme ? {} : { templatePublishAt: null }),
      themeDraftTemplate: sameTheme ? null : chosen.template,
      themeDraftVersion: sameTheme ? null : chosen.version,
    });
  }

  private async updateRevision(store: Storefront, savedAt: string | undefined, data: Prisma.StorefrontUpdateInput): Promise<Storefront> {
    this.assertRevision(store, savedAt);
    try {
      return await this.prisma.storefront.update({
        where: { tenantId: store.tenantId, updatedAt: store.updatedAt }, data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('Tu diseño cambió en otra sesión. Vuelve a abrir el editor antes de guardar.');
      }
      throw error;
    }
  }

  private assertRevision(store: Storefront, savedAt?: string): void {
    if (savedAt && savedAt !== store.updatedAt.toISOString()) throw new ConflictException('Tu diseño cambió en otra sesión. Vuelve a abrir el editor antes de guardar.');
  }

  private trace(operation: string, themeId: string, version: string, outcome: string): void {
    this.logger.log(JSON.stringify({ event: 'theme_operation', operation, themeId, version, outcome, contracts: THEME_ENVIRONMENT.contracts }));
  }

  /**
   * Draft → published, keeping the replaced content as a version. The row is claimed by its
   * `updatedAt`, so a manual publish and the schedule sweep never publish the same draft twice.
   */
  private async publishDraft(tenantId: string, savedAt?: string, dueAt?: Date): Promise<boolean> {
    let publishedSelection: ReturnType<typeof selection> | undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const storefront = await tx.storefront.findUniqueOrThrow({
        where: { tenantId },
      });
      this.assertRevision(storefront, savedAt);
      if (dueAt && (!storefront.templatePublishAt || storefront.templatePublishAt > dueAt)) return false;
      if (!storefront.templateDraft && !storefront.themeDraftTemplate) {
        if (storefront.templatePublishAt) {
          await tx.storefront.update({
            where: { tenantId },
            data: { templatePublishAt: null },
          });
        }
        return false;
      }
      assertContentVersion(storefront.templateContent);
      assertContentVersion(storefront.templateDraft);
      const chosen = selection(storefront, true);
      assertTheme(chosen.template, chosen.version, storefront.industry);
      const previous = readTemplateContent(storefront.templateContent);
      const claimed = await tx.storefront.updateMany({
        where: { tenantId, updatedAt: storefront.updatedAt },
        data: {
          templateContent: readTemplateContent(storefront.templateDraft ?? storefront.templateContent),
          template: chosen.template,
          themeVersion: chosen.version,
          themeDraftTemplate: null,
          themeDraftVersion: null,
          templateDraft: Prisma.DbNull,
          templatePublishAt: null,
        },
      });
      if (claimed.count === 0) {
        if (savedAt) throw new ConflictException('Tu diseño cambió en otra sesión. Vuelve a abrir el editor antes de publicar.');
        return false;
      }
      await tx.storefrontVersion.create({
        data: { tenantId, content: previous, template: storefront.template, themeVersion: storefront.themeVersion },
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
      publishedSelection = chosen;
      return true;
    });
    if (publishedSelection) this.trace('publish', getTheme(publishedSelection.template, publishedSelection.version)!.id, publishedSelection.version, 'published');
    return result;
  }

  private state(storefront: Storefront): StoreEditorState {
    const published = readTemplateContent(storefront.templateContent);
    const draft = storefront.templateDraft
      ? readTemplateContent(storefront.templateDraft)
      : null;
    const pending = Boolean(draft && !sameContent(draft, published) || storefront.themeDraftTemplate);
    const chosen = selection(storefront, true);
    return {
      template: chosen.template,
      themeVersion: chosen.version,
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
