import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storefront } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { MediaService } from '../catalog/media.service';
import { isIntegrationActive } from '../integrations/integration-state';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_IMAGE_EXCLUDED_BLOCKS,
  buildImagePrompt,
  imageSize,
} from './store-ai-image';
import {
  AI_EXCLUDED_BLOCKS,
  AI_PAGE_EXCLUDED_BLOCKS,
  AI_PAGE_EXCLUDED_SECTIONS,
  PageAiResult,
  TextAiAction,
  TextAiBusiness,
  buildPagePrompt,
  buildSectionPrompt,
  buildTextPrompt,
  needsCurrentText,
  pickPageTexts,
  pickSectionTexts,
  pickSuggestions,
  suggestionCount,
} from './store-ai-text';
import {
  TEMPLATE_SECTIONS,
  effectiveTemplate,
  isTextField,
  readTemplateContent,
  sectionType,
} from './store-templates';
import { ensureStorefront } from './storefront-row';

const OPENAI_TIMEOUT_MS = 20_000;
/** Image models take far longer than text; kept under the 60 s `proxy_read_timeout` of nginx. */
const OPENAI_IMAGE_TIMEOUT_MS = 55_000;
const OPENAI_PAGE_TIMEOUT_MS = 45_000;
const MAX_CATEGORIES = 12;
const MAX_PRODUCTS = 12;

export type TextAiInput = {
  section: string;
  field: string;
  action: TextAiAction;
  current?: string;
  instruction?: string;
};

export type ImageAiInput = {
  section: string;
  field: string;
  instruction?: string;
};

/**
 * Writing assistant of the store editor. It is not the sales agent: it only drafts texts for
 * the merchant, who reviews them before they reach the draft. Each request uses one editor
 * text of the plan, a cap separate from the agent replies.
 */
@Injectable()
export class StorefrontAiService {
  private readonly logger = new Logger(StorefrontAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly plans: PlanLimitsService,
    private readonly media: MediaService,
  ) {}

  async suggestText(
    tenantId: string,
    input: TextAiInput,
  ): Promise<{ suggestions: string[] }> {
    const apiKey = await this.assertReady(tenantId);
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const template = effectiveTemplate(
      storefront.template,
      storefront.industry,
    );
    const type = sectionType(input.section);
    const section = TEMPLATE_SECTIONS[template].find((s) => s.id === type);
    const field = section?.fields.find((f) => f.id === input.field);
    if (!section || !field || !isTextField(field)) {
      throw new BadRequestException('Ese texto no existe en tu plantilla.');
    }
    const current = (input.current ?? '').trim();
    const instruction = (input.instruction ?? '').trim();
    if (needsCurrentText(input.action) && !current) {
      throw new BadRequestException(
        'Escribe un texto primero para poder mejorarlo.',
      );
    }
    await this.assertQuota(tenantId);

    const content = readTemplateContent(
      storefront.templateDraft ?? storefront.templateContent,
    );
    const saved = content.sections[input.section] ?? {};
    const siblings: Record<string, string> = {};
    for (const other of section.fields) {
      if (other.id === field.id || !isTextField(other)) continue;
      const text = saved[other.id] ?? section.defaults?.[other.id] ?? '';
      if (text) siblings[other.label] = text;
    }
    const request = {
      business: await this.business(tenantId, storefront),
      section,
      field,
      siblings,
      current,
      instruction,
      action: input.action,
    };
    const raw = await this.complete(
      tenantId,
      apiKey,
      buildTextPrompt(request),
      {
        temperature: input.action === 'fix' ? 0 : 0.8,
        maxTokens: Math.min(
          1500,
          150 +
            Math.ceil(field.maxLength * 0.6) * suggestionCount(input.action),
        ),
      },
    );
    const suggestions = pickSuggestions(raw, request);
    if (!suggestions.length) {
      throw new ServiceUnavailableException(
        'No salió ninguna propuesta útil. Prueba con otra indicación.',
      );
    }
    return { suggestions };
  }

  /** A library block chosen and written from the merchant's request; the console adds it to the draft. */
  async suggestSection(
    tenantId: string,
    prompt: string,
  ): Promise<{ type: string; texts: Record<string, string> }> {
    const apiKey = await this.assertReady(tenantId);
    const request = prompt.trim();
    if (request.length < 3)
      throw new BadRequestException('Cuéntanos qué sección quieres crear.');
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const template = effectiveTemplate(
      storefront.template,
      storefront.industry,
    );
    const blocks = TEMPLATE_SECTIONS[template].filter(
      (s) => s.role === 'block' && !AI_EXCLUDED_BLOCKS.includes(s.id),
    );
    await this.assertQuota(tenantId);

    const business = await this.business(tenantId, storefront);
    const raw = await this.complete(
      tenantId,
      apiKey,
      buildSectionPrompt({ business, blocks, prompt: request }),
      {
        temperature: 0.7,
        maxTokens: 900,
      },
    );
    const section = pickSectionTexts(raw, blocks, request);
    if (!section) {
      throw new ServiceUnavailableException(
        'No salió una sección útil. Prueba describiéndola de otra forma.',
      );
    }
    return section;
  }

  /**
   * Texts of the built-in home sections plus a few library blocks, in order. The console
   * applies it to the draft as one undo step; it uses one editor text of the plan.
   */
  async suggestPage(tenantId: string, prompt: string): Promise<PageAiResult> {
    const apiKey = await this.assertReady(tenantId);
    const request = prompt.trim();
    if (request.length < 3)
      throw new BadRequestException(
        'Cuéntanos de tu negocio y qué quieres destacar.',
      );
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const template = effectiveTemplate(
      storefront.template,
      storefront.industry,
    );
    const schema = TEMPLATE_SECTIONS[template];
    const sections = schema.filter(
      (s) =>
        s.role === 'builtin' &&
        !AI_PAGE_EXCLUDED_SECTIONS.includes(s.id) &&
        s.fields.some(isTextField),
    );
    const blocks = schema.filter(
      (s) => s.role === 'block' && !AI_PAGE_EXCLUDED_BLOCKS.includes(s.id),
    );
    await this.assertQuota(tenantId);

    const business = await this.business(tenantId, storefront);
    const raw = await this.complete(
      tenantId,
      apiKey,
      buildPagePrompt({ business, sections, blocks, prompt: request }),
      { temperature: 0.7, maxTokens: 2500, timeoutMs: OPENAI_PAGE_TIMEOUT_MS },
    );
    const page = pickPageTexts(raw, { sections, blocks, prompt: request });
    if (!page) {
      throw new ServiceUnavailableException(
        'No salió una página útil. Prueba contándonos más de tu negocio.',
      );
    }
    return page;
  }

  /**
   * One ambiance photo for an image field, saved like an upload of the business. Never a
   * product, place or team photo: those must be real.
   */
  async suggestImage(
    tenantId: string,
    input: ImageAiInput,
  ): Promise<{ url: string }> {
    const apiKey = await this.assertReady(tenantId);
    const storefront = await ensureStorefront(this.prisma, tenantId);
    const template = effectiveTemplate(
      storefront.template,
      storefront.industry,
    );
    const type = sectionType(input.section);
    const section = TEMPLATE_SECTIONS[template].find((s) => s.id === type);
    const field = section?.fields.find((f) => f.id === input.field);
    if (!section || field?.kind !== 'image') {
      throw new BadRequestException('Esa imagen no existe en tu plantilla.');
    }
    if (AI_IMAGE_EXCLUDED_BLOCKS.includes(section.id)) {
      throw new BadRequestException(
        'Esta sección es para fotos reales de tus productos, tu local o tu equipo.',
      );
    }
    await this.plans.assertCanUseEditorAi(tenantId, 'image');

    const content = readTemplateContent(
      storefront.templateDraft ?? storefront.templateContent,
    );
    const saved = content.sections[input.section] ?? {};
    const texts = section.fields
      .filter(isTextField)
      .map((f) => saved[f.id] ?? section.defaults?.[f.id] ?? '')
      .filter(Boolean);
    const { industry, categories } = await this.business(tenantId, storefront);
    const prompt = buildImagePrompt({
      business: { industry, categories },
      section,
      texts,
      instruction: (input.instruction ?? '').trim(),
    });

    let bytes: Buffer;
    try {
      const response = await fetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(OPENAI_IMAGE_TIMEOUT_MS),
          body: JSON.stringify({
            model: this.config.get<string>(
              'OPENAI_IMAGE_MODEL',
              'gpt-image-1-mini',
            ),
            prompt,
            n: 1,
            size: imageSize(template, section.id),
            quality: 'medium',
            output_format: 'webp',
          }),
        },
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
      };
      const encoded = payload.data?.[0]?.b64_json;
      if (!encoded) throw new Error('empty image');
      bytes = Buffer.from(encoded, 'base64');
    } catch (error) {
      this.logger.warn(
        `Store image generation failed: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No pudimos crear la imagen ahora. Inténtalo de nuevo en unos segundos.',
      );
    }
    await this.plans.recordEditorAi(tenantId, 'image');
    return this.media.storeGenerated(tenantId, bytes);
  }

  /** Store integration on and AI configured; returns the OpenAI key. */
  private async assertReady(tenantId: string): Promise<string> {
    if (!(await isIntegrationActive(this.prisma, tenantId, 'store'))) {
      throw new ForbiddenException(
        'Activa «Tienda web» en Integraciones para editar tu tienda.',
      );
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'La IA del editor no está disponible por ahora.',
      );
    return apiKey;
  }

  private assertQuota(tenantId: string): Promise<void> {
    return this.plans.assertCanUseEditorAi(tenantId, 'text');
  }

  /** One JSON completion; it counts as an editor text of the plan once OpenAI answers. */
  private async complete(
    tenantId: string,
    apiKey: string,
    prompt: { system: string; user: string },
    options: { temperature: number; maxTokens: number; timeoutMs?: number },
  ): Promise<unknown> {
    let raw: unknown;
    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(options.timeoutMs ?? OPENAI_TIMEOUT_MS),
          body: JSON.stringify({
            model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
          }),
        },
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      raw = JSON.parse(payload.choices?.[0]?.message?.content ?? 'null');
    } catch (error) {
      this.logger.warn(
        `Store text generation failed: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No pudimos generar textos ahora. Inténtalo de nuevo en unos segundos.',
      );
    }
    await this.plans.recordEditorAi(tenantId, 'text');
    return raw;
  }

  private async business(
    tenantId: string,
    storefront: Pick<Storefront, 'displayName' | 'tagline' | 'industry'>,
  ): Promise<TextAiBusiness> {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isPublishedOnStore: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { name: true, categories: true },
      take: 60,
    });
    const categories = [
      ...new Set(products.flatMap((p) => p.categories)),
    ].slice(0, MAX_CATEGORIES);
    return {
      name: storefront.displayName,
      industry: storefront.industry,
      tagline: storefront.tagline,
      categories,
      products: products.slice(0, MAX_PRODUCTS).map((p) => p.name),
    };
  }
}
