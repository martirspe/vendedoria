import { createHmac } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { RATE_LIMIT_KEY, type RateLimitRule } from './rate-limit.decorator';

export const RATE_LIMIT_WINDOW_MS = 60_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly secret: string;
  private readonly enabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = `rate-limit:${config.getOrThrow<string>('JWT_ACCESS_SECRET')}`;
    this.enabled = config.get<string>('NODE_ENV') !== 'test';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule || !this.enabled) return true;

    const ip = context.switchToHttp().getRequest<FastifyRequest>().ip;
    const window = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    const key = createHmac('sha256', this.secret).update(`${ip}|${rule.bucket}|${window}`).digest('hex');
    const hit = await this.prisma.rateLimitHit.upsert({
      where: { key },
      create: { key, expiresAt: new Date((window + 2) * RATE_LIMIT_WINDOW_MS) },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (hit.count > rule.perMinute) {
      throw new HttpException(
        'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
