import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { activeCustomDomain } from '../integrations/integration-state';
import { PrismaService } from '../prisma/prisma.service';
import { TURNSTILE_ACTION_KEY, TURNSTILE_HEADER, type TurnstileAction } from './turnstile.decorator';
import { TurnstileService } from './turnstile.service';

@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly active: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly turnstile: TurnstileService,
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.active = turnstile.enabled && config.get<string>('NODE_ENV') !== 'test';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<TurnstileAction | undefined>(TURNSTILE_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action || !this.active) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest<{ Params: { slug?: string } }>>();
    const header = request.headers[TURNSTILE_HEADER];
    const storeSlug = request.params?.slug;
    const result = await this.turnstile.verify(typeof header === 'string' ? header : undefined, {
      action,
      remoteIp: request.ip,
      storeSlug,
      storeDomain: storeSlug ? await this.storeDomain(storeSlug) : null,
    });
    if (result === 'unavailable') {
      throw new ServiceUnavailableException('No pudimos completar la verificación de seguridad. Inténtalo de nuevo en unos segundos.');
    }
    if (result === 'rejected') {
      throw new ForbiddenException('No pudimos verificar que eres una persona. Vuelve a intentarlo.');
    }
    return true;
  }

  private async storeDomain(slug: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return tenant ? activeCustomDomain(this.prisma, tenant.id) : null;
  }
}
