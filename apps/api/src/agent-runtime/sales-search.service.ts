import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConversionInfrastructure } from '../conversion/conversion-infrastructure.service';

type DocumentType = 'product' | 'faq';
type SearchPoint = {
  payload?: { tenantId?: string; sourceId?: string; documentType?: string };
};

@Injectable()
export class SalesSearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalesSearchService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private ready = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly infra: ConversionInfrastructure,
  ) {}
  get enabled(): boolean {
    return Boolean(
      this.config.get('QDRANT_URL') && this.config.get('OPENAI_API_KEY'),
    );
  }
  get collection(): string {
    return `sales_semantic_${this.config.get<string>('SALES_EMBEDDING_MODEL', 'text-embedding-3-small').replace(/[^a-z0-9]/g, '_')}_v1`;
  }
  onModuleInit(): void {
    if (!this.enabled || this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      void this.flush().catch(() =>
        this.logger.warn('Sales search worker unavailable'),
      );
    }, 3000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async candidates(
    tenantId: string,
    text: string,
    documentType: DocumentType,
  ): Promise<string[]> {
    if (!this.enabled || !text.trim()) return [];
    try {
      const cacheKey = `wa:embedding:${tenantId}:${createHash('sha256').update(`${this.collection}/${text}`).digest('hex')}`;
      let vector: number[] | undefined;
      try {
        const hit = await this.infra.redis?.get(cacheKey);
        if (hit) vector = JSON.parse(hit) as number[];
      } catch {
        /* Optional. */
      }
      if (!vector) {
        vector = await this.embedding(text);
        try {
          await this.infra.redis?.set(
            cacheKey,
            JSON.stringify(vector),
            'EX',
            300,
          );
        } catch {
          /* Optional. */
        }
      }
      const response = (await this.request('/points/query', 'POST', {
        query: vector,
        limit: Number(this.config.get('SALES_RETRIEVAL_TOP_K', 12)),
        score_threshold: Number(
          this.config.get('SALES_SIMILARITY_THRESHOLD', 0.3),
        ),
        filter: {
          must: [
            { key: 'tenantId', match: { value: tenantId } },
            { key: 'documentType', match: { value: documentType } },
            { key: 'active', match: { value: true } },
          ],
        },
        with_payload: ['tenantId', 'sourceId', 'documentType'],
      })) as { result?: { points?: SearchPoint[] } };
      return [
        ...new Set(
          (response.result?.points ?? []).flatMap((p) =>
            p.payload?.tenantId === tenantId &&
            p.payload.documentType === documentType &&
            typeof p.payload.sourceId === 'string'
              ? [p.payload.sourceId]
              : [],
          ),
        ),
      ];
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: 'sales_retrieval_fallback',
          tenantId,
          documentType,
        }),
      );
      return [];
    }
  }

  /** One tenant-scoped page per request. Caller can resume with nextCursor after interruption. */
  async backfill(
    tenantId: string,
    documentType: DocumentType,
    after?: string,
  ): Promise<{ queued: number; nextCursor: string | null }> {
    const rows =
      documentType === 'product'
        ? await this.prisma.product.findMany({
            where: { tenantId, ...(after ? { id: { gt: after } } : {}) },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 100,
          })
        : await this.prisma.knowledgeFaq.findMany({
            where: { tenantId, ...(after ? { id: { gt: after } } : {}) },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 100,
          });
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.salesSearchJob.upsert({
          where: {
            tenantId_documentType_sourceId: {
              tenantId,
              documentType,
              sourceId: row.id,
            },
          },
          create: { tenantId, documentType, sourceId: row.id },
          update: {
            revision: { increment: 1 },
            attempts: 0,
            availableAt: new Date(),
          },
        }),
      ),
    );
    return {
      queued: rows.length,
      nextCursor: rows.length === 100 ? rows.at(-1)!.id : null,
    };
  }

  async flush(): Promise<void> {
    if (this.busy || !this.enabled) return;
    this.busy = true;
    try {
      await this.ensureCollection();
      const jobs = await this.prisma.salesSearchJob.findMany({
        where: { attempts: { lt: 5 }, availableAt: { lte: new Date() } },
        orderBy: { availableAt: 'asc' },
        take: 12,
      });
      for (const job of jobs) {
        await this.prisma.$transaction(
          async (tx) => {
            const locks = await tx.$queryRaw<Array<{ locked: boolean }>>(
              Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`sales-search/${job.tenantId}/${job.sourceId}`}, 0)) AS locked`,
            );
            if (!locks[0]?.locked) return;
            const current = await this.prisma.salesSearchJob.findFirst({
              where: {
                id: job.id,
                tenantId: job.tenantId,
                revision: job.revision,
              },
            });
            if (!current) return;
            try {
              await this.indexSource(
                job.tenantId,
                job.sourceId,
                job.documentType as DocumentType,
              );
              await this.prisma.salesSearchJob.deleteMany({
                where: {
                  id: job.id,
                  tenantId: job.tenantId,
                  revision: job.revision,
                },
              });
            } catch {
              await this.prisma.salesSearchJob.updateMany({
                where: {
                  id: job.id,
                  tenantId: job.tenantId,
                  revision: job.revision,
                },
                data: {
                  attempts: { increment: 1 },
                  availableAt: new Date(
                    Date.now() + Math.min(300000, 5000 * 2 ** job.attempts),
                  ),
                },
              });
              this.logger.warn(
                JSON.stringify({
                  event: 'sales_index_failed',
                  tenantId: job.tenantId,
                  sourceId: job.sourceId,
                  attempts: job.attempts + 1,
                }),
              );
            }
          },
          { timeout: 30000 },
        );
      }
    } finally {
      this.busy = false;
    }
  }

  async indexSource(
    tenantId: string,
    sourceId: string,
    documentType: DocumentType,
  ): Promise<void> {
    const product =
      documentType === 'product'
        ? await this.prisma.product.findFirst({
            where: { tenantId, id: sourceId },
            include: { variants: true },
          })
        : null;
    const faq =
      documentType === 'faq'
        ? await this.prisma.knowledgeFaq.findFirst({
            where: { tenantId, id: sourceId },
          })
        : null;
    const active =
      product?.isAvailable ??
      Boolean(faq?.isPublished && faq.reviewStatus === 'APPROVED');
    const id = pointId(tenantId, documentType, sourceId);
    const sourceFilter = {
      must: [
        { key: 'tenantId', match: { value: tenantId } },
        { key: 'sourceId', match: { value: sourceId } },
        { key: 'documentType', match: { value: documentType } },
      ],
    };
    if (!active) {
      await this.request('/points/delete?wait=true', 'POST', {
        filter: sourceFilter,
      });
      return;
    }
    // No price, stock, digital access URLs, phones or other transaction data is embedded/indexed.
    const text = product
      ? JSON.stringify({
          name: product.name,
          brand: product.brand,
          categories: product.categories,
          description: product.descriptionShort,
          full: product.descriptionFull,
          details: product.details,
          variants: product.variants.map((v) => [
            v.option1Value,
            v.option2Value,
            v.option3Value,
          ]),
        })
      : `${faq!.question}\n${faq!.answer}\n${faq!.tags.join(' ')}`;
    const chunks = text.match(/[\s\S]{1,4000}/g) ?? [];
    // Each chunk carries source/version/tenant metadata; hydration always returns the latest DB row.
    const vectors = await Promise.all(
      chunks.slice(0, 4).map((chunk) => this.embedding(chunk)),
    );
    await this.request('/points/delete?wait=true', 'POST', {
      filter: sourceFilter,
    });
    await this.request('/points?wait=true', 'PUT', {
      points: vectors.map((vector, chunkIndex) => ({
        id:
          chunkIndex === 0
            ? id
            : pointId(tenantId, documentType, `${sourceId}/${chunkIndex}`),
        vector,
        payload: {
          tenantId,
          sourceId,
          chunkIndex,
          ...(product
            ? { productId: sourceId, categories: product.categories }
            : {}),
          documentType,
          version: (product?.updatedAt ?? faq!.updatedAt).toISOString(),
          active: true,
        },
      })),
    });
  }

  private async embedding(input: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get<string>('OPENAI_API_KEY')}`,
      },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        model: this.config.get<string>(
          'SALES_EMBEDDING_MODEL',
          'text-embedding-3-small',
        ),
        dimensions: 1536,
        input,
      }),
    });
    if (!response.ok) throw new Error('SALES_EMBEDDING_UNAVAILABLE');
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vector = payload.data?.[0]?.embedding;
    if (
      !vector ||
      vector.length !== 1536 ||
      vector.some((n) => !Number.isFinite(n))
    )
      throw new Error('SALES_EMBEDDING_INVALID');
    return vector;
  }
  private async ensureCollection(): Promise<void> {
    if (this.ready) return;
    try {
      await this.request('', 'PUT', {
        vectors: { size: 1536, distance: 'Cosine' },
      });
    } catch {
      const existing = (await this.request('', 'GET')) as {
        result?: { config?: { params?: { vectors?: { size?: number } } } };
      };
      if (existing.result?.config?.params?.vectors?.size !== 1536)
        throw new Error('SALES_INDEX_DIMENSION_MISMATCH');
    }
    for (const [field_name, field_schema] of [
      ['tenantId', 'keyword'],
      ['documentType', 'keyword'],
      ['active', 'bool'],
    ])
      await this.request('/index?wait=true', 'PUT', {
        field_name,
        field_schema,
      });
    this.ready = true;
  }
  private async request(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<unknown> {
    const key = this.config.get<string>('QDRANT_API_KEY');
    const response = await fetch(
      `${this.config.getOrThrow<string>('QDRANT_URL').replace(/\/$/, '')}/collections/${this.collection}${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'api-key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) throw new Error('SALES_INDEX_UNAVAILABLE');
    return response.json();
  }
}

export function pointId(
  tenantId: string,
  type: string,
  sourceId: string,
): string {
  const hex = createHash('sha256')
    .update(`${tenantId}/${type}/${sourceId}`)
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
