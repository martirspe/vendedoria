import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ConversionInfrastructure } from './conversion-infrastructure.service';

const COLLECTION = 'store_affinity_v1';
type IndexJob = { tenantId: string };
type Features = { handle: string; categories: string[]; brand: string | null };

/** Feature vectors of actual catalog/category affinity; no synthetic customers or LLM claims. */
export function affinityVector(products: Features[]): number[] {
  const vector = Array<number>(128).fill(0);
  for (const product of products) {
    const features: Array<[string, number]> = [
      [`product/${product.handle}`, 1],
      ...product.categories.map((c): [string, number] => [
        `category/${c.toLowerCase()}`,
        3,
      ]),
      ...(product.brand
        ? [[`brand/${product.brand.toLowerCase()}`, 1] as [string, number]]
        : []),
    ];
    for (const [feature, weight] of features)
      vector[
        createHash('sha256').update(feature).digest().readUInt32BE(0) %
          vector.length
      ] += weight;
  }
  const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
  return norm ? vector.map((n) => n / norm) : vector;
}

@Injectable()
export class RecommendationVectors implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecommendationVectors.name);
  private queue?: Queue<IndexJob>;
  private worker?: Worker<IndexJob>;
  private initialized = false;
  constructor(
    private readonly infra: ConversionInfrastructure,
    private readonly prisma: PrismaService,
  ) {}
  onModuleInit(): void {
    if (!this.infra.connection || !this.infra.config.get<string>('QDRANT_URL'))
      return;
    this.queue = new Queue<IndexJob>('store-affinity-index', {
      connection: { ...this.infra.connection, maxRetriesPerRequest: 1 },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    });
    this.worker = new Worker<IndexJob>(
      'store-affinity-index',
      (job) => this.index(job.data.tenantId),
      { connection: this.infra.connection, concurrency: 1 },
    );
    this.queue.on('error', () =>
      this.logger.warn('Affinity index queue unavailable'),
    );
    this.worker.on('error', () =>
      this.logger.warn('Affinity index worker unavailable'),
    );
    this.worker.on('failed', () => this.logger.warn('Affinity index failed'));
  }
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
  async rank(tenantId: string, products: Features[]): Promise<string[]> {
    if (!this.queue || !products.length) return [];
    try {
      // The first request schedules indexing; it never performs index writes on the serving path.
      const schedule = await this.infra.redis?.set(
        `conversion-index/${tenantId}`,
        '1',
        'EX',
        900,
        'NX',
      );
      if (schedule)
        void this.queue
          .add('catalog', { tenantId }, { jobId: tenantId })
          .catch(() => this.logger.warn('Affinity indexing unavailable'));
      const result = (await this.request(
        '/points/query',
        'POST',
        {
          query: affinityVector(products),
          filter: { must: [{ key: 'tenantId', match: { value: tenantId } }] },
          limit: 40,
          with_payload: ['handle'],
        },
        100,
      )) as { result?: { points?: Array<{ payload?: { handle?: string } }> } };
      return (result.result?.points ?? []).flatMap((point) =>
        typeof point.payload?.handle === 'string' ? [point.payload.handle] : [],
      );
    } catch {
      return [];
    }
  }
  private async index(tenantId: string): Promise<void> {
    try {
      if (!this.initialized) {
        await this.request(
          '',
          'PUT',
          { vectors: { size: 128, distance: 'Cosine' } },
          5000,
          true,
        );
        await this.request(
          '/index',
          'PUT',
          { field_name: 'tenantId', field_schema: 'keyword' },
          5000,
        );
        this.initialized = true;
      }
      let cursor: string | undefined;
      for (;;) {
        const products = await this.prisma.product.findMany({
          where: { tenantId },
          take: 200,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, handle: true, categories: true, brand: true },
        });
        if (!products.length) break;
        await this.request(
          '/points?wait=true',
          'PUT',
          {
            points: products.map((p) => {
              const hex = createHash('sha256')
                .update(`${tenantId}/${p.id}`)
                .digest('hex')
                .slice(0, 32);
              return {
                id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
                vector: affinityVector([p]),
                payload: { tenantId, handle: p.handle },
              };
            }),
          },
          10_000,
        );
        cursor = products[products.length - 1].id;
      }
    } catch {
      throw new Error('Affinity indexing failed');
    }
  }
  private async request(
    path: string,
    method: string,
    body: unknown,
    timeout: number,
    allowExists = false,
  ): Promise<unknown> {
    const base = this.infra.config
      .getOrThrow<string>('QDRANT_URL')
      .replace(/\/$/, '');
    const key = this.infra.config.get<string>('QDRANT_API_KEY');
    const response = await fetch(`${base}/collections/${COLLECTION}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'api-key': key } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    if (allowExists && response.status === 409) return {};
    if (!response.ok) throw new Error('Affinity provider unavailable');
    return response.json();
  }
}
