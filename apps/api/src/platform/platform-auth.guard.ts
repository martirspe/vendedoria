import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  PLATFORM_PERMISSIONS_KEY,
  type PlatformOperator,
} from './platform-operator';
import { operatorCan, type PlatformPermission } from './platform-permissions';

@Injectable()
export class PlatformAuthGuard extends AuthGuard('platform-jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const required =
      this.reflector.getAllAndOverride<PlatformPermission[] | undefined>(
        PLATFORM_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const operator = context
      .switchToHttp()
      .getRequest<{ user: PlatformOperator }>().user;
    if (operatorCan(operator.platformRole, required)) {
      return true;
    }
    throw new ForbiddenException('Tu rol de operador no permite esta acción');
  }

  handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
