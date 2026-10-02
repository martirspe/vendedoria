import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { RATE_LIMIT_WINDOW_MS, RateLimitGuard } from './rate-limit.guard';

@Module({
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitModule.name);
  private sweep?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.sweep = setInterval(() => {
      this.prisma.rateLimitHit
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch((error: unknown) => this.logger.error(`Rate limit sweep failed: ${(error as Error).message}`));
    }, RATE_LIMIT_WINDOW_MS);
    this.sweep.unref();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }
}
