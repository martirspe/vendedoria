import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

@Injectable()
export class ConversionInfrastructure implements OnModuleDestroy {
  private readonly logger = new Logger(ConversionInfrastructure.name);
  readonly redis: Redis | null;
  readonly connection: ConnectionOptions | null;
  constructor(readonly config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url || config.get<string>('NODE_ENV') === 'test') {
      this.redis = null;
      this.connection = null;
      return;
    }
    const parsed = new URL(url);
    this.connection = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db: Number(parsed.pathname.slice(1) || 0),
      ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    };
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      commandTimeout: 150,
      connectTimeout: 1000,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () =>
      this.logger.warn('Conversion cache unavailable'),
    );
  }
  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
  }
  async cached<T>(key: string, read: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis?.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* Ranking has a database fallback. */
    }
    const value = await read();
    try {
      await this.redis?.set(key, JSON.stringify(value), 'EX', 60);
    } catch {
      /* Optional cache. */
    }
    return value;
  }
}
