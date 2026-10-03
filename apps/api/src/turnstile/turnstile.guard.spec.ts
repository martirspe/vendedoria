import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { TurnstileAction } from './turnstile.decorator';
import { TurnstileGuard } from './turnstile.guard';
import type { TurnstileResult, TurnstileService } from './turnstile.service';
import type { PrismaService } from '../prisma/prisma.service';

function setup(action: TurnstileAction | undefined, result: TurnstileResult, nodeEnv = 'production') {
  const turnstile = { enabled: true, verify: jest.fn().mockResolvedValue(result) };
  const reflector = { getAllAndOverride: () => action } as unknown as Reflector;
  const guard = new TurnstileGuard(
    reflector,
    turnstile as unknown as TurnstileService,
    new ConfigService({ NODE_ENV: nodeEnv }),
    { tenant: { findUnique: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService,
  );
  const context = (headers: Record<string, string>, params: Record<string, string> = {}) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ headers, params, ip: '203.0.113.7' }) }),
    }) as unknown as ExecutionContext;
  return { guard, turnstile, context };
}

describe('TurnstileGuard', () => {
  it('verifies the header token with the route action, client IP and store slug', async () => {
    const { guard, turnstile, context } = setup('checkout', 'ok');
    await expect(guard.canActivate(context({ 'x-turnstile-token': 'tok' }, { slug: 'acme' }))).resolves.toBe(true);
    expect(turnstile.verify).toHaveBeenCalledWith('tok', {
      action: 'checkout',
      remoteIp: '203.0.113.7',
      storeSlug: 'acme',
      storeDomain: null,
    });
  });

  it('answers 403 for rejected tokens and 503 when Cloudflare is unreachable', async () => {
    const rejected = setup('login', 'rejected');
    await expect(rejected.guard.canActivate(rejected.context({}))).rejects.toBeInstanceOf(ForbiddenException);
    const down = setup('login', 'unavailable');
    await expect(down.guard.canActivate(down.context({ 'x-turnstile-token': 'tok' }))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('ignores routes without the decorator and the test environment', async () => {
    const plain = setup(undefined, 'rejected');
    await expect(plain.guard.canActivate(plain.context({}))).resolves.toBe(true);
    const testEnv = setup('register', 'rejected', 'test');
    await expect(testEnv.guard.canActivate(testEnv.context({}))).resolves.toBe(true);
    expect(testEnv.turnstile.verify).not.toHaveBeenCalled();
  });
});
