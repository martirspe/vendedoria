import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { PrismaService } from '../prisma/prisma.service';
import type { RateLimitRule } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

function setup(rule: RateLimitRule | undefined, nodeEnv = 'development') {
  const counts = new Map<string, number>();
  const prisma = {
    rateLimitHit: {
      upsert: jest.fn(({ where }: { where: { key: string } }) => {
        const count = (counts.get(where.key) ?? 0) + 1;
        counts.set(where.key, count);
        return Promise.resolve({ count });
      }),
    },
  };
  const reflector = { getAllAndOverride: () => rule } as unknown as Reflector;
  const config = new ConfigService({ JWT_ACCESS_SECRET: 'test-secret', NODE_ENV: nodeEnv });
  const guard = new RateLimitGuard(reflector, prisma as unknown as PrismaService, config);
  const context = (ip: string) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ ip }) }),
    }) as unknown as ExecutionContext;
  return { guard, prisma, counts, context };
}

describe('RateLimitGuard', () => {
  it('allows up to the limit per IP and rejects the next request with 429', async () => {
    const { guard, context } = setup({ bucket: 'store-checkout', perMinute: 2 });
    await expect(guard.canActivate(context('203.0.113.7'))).resolves.toBe(true);
    await expect(guard.canActivate(context('203.0.113.7'))).resolves.toBe(true);
    const rejected = guard.canActivate(context('203.0.113.7'));
    await expect(rejected).rejects.toBeInstanceOf(HttpException);
    await expect(rejected).rejects.toMatchObject({ status: 429 });
    await expect(guard.canActivate(context('198.51.100.4'))).resolves.toBe(true);
  });

  it('never stores the raw IP', async () => {
    const { guard, counts, context } = setup({ bucket: 'auth-login', perMinute: 5 });
    await guard.canActivate(context('203.0.113.7'));
    const [key] = [...counts.keys()];
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('203.0.113.7');
  });

  it('ignores routes without a rule and the test environment', async () => {
    const plain = setup(undefined);
    await expect(plain.guard.canActivate(plain.context('203.0.113.7'))).resolves.toBe(true);
    expect(plain.prisma.rateLimitHit.upsert).not.toHaveBeenCalled();

    const testEnv = setup({ bucket: 'store-pay', perMinute: 1 }, 'test');
    await testEnv.guard.canActivate(testEnv.context('203.0.113.7'));
    await expect(testEnv.guard.canActivate(testEnv.context('203.0.113.7'))).resolves.toBe(true);
    expect(testEnv.prisma.rateLimitHit.upsert).not.toHaveBeenCalled();
  });
});
