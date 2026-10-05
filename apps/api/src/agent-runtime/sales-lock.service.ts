import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ConversionInfrastructure } from '../conversion/conversion-infrastructure.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesConversationLock {
  constructor(
    private readonly prisma: PrismaService,
    private readonly infra: ConversionInfrastructure,
    private readonly config: ConfigService,
  ) {}

  /** PostgreSQL exclusion also fences Redis expiry/outages and process restarts. */
  async run<T>(
    tenantId: string,
    conversationId: string,
    action: (assertOwned: () => Promise<void>) => Promise<T>,
  ): Promise<T | undefined> {
    const key = `wa:lock:${tenantId}:${conversationId}`;
    const token = randomUUID();
    const ttl = Number(this.config.get('SALES_LOCK_TTL_MS', 30000));
    let redisOwned = false;
    try {
      const acquired = await this.infra.redis?.set(key, token, 'PX', ttl, 'NX');
      if (acquired === null && this.infra.redis) return undefined;
      redisOwned = acquired === 'OK';
    } catch {
      /* PostgreSQL remains mandatory. */
    }
    const renewal = redisOwned
      ? setInterval(
          () => {
            void this.infra.redis
              ?.eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
                1,
                key,
                token,
                ttl,
              )
              .catch(() => undefined);
          },
          Math.floor(ttl / 3),
        )
      : undefined;
    renewal?.unref();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locks = await tx.$queryRaw<Array<{ locked: boolean }>>(
            Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`,
          );
          if (!locks[0]?.locked) return undefined;
          const assertOwned = async () => {
            await tx.$queryRaw`SELECT 1`;
          };
          return action(assertOwned);
        },
        { timeout: 120000, maxWait: 5000 },
      );
    } finally {
      if (renewal) clearInterval(renewal);
      if (redisOwned) {
        try {
          await this.infra.redis?.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            key,
            token,
          );
        } catch {
          /* Lease expires. */
        }
      }
    }
  }
}
