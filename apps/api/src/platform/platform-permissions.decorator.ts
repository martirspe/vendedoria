import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PlatformAuthGuard } from './platform-auth.guard';
import {
  PLATFORM_PERMISSIONS_KEY,
  type PlatformOperator,
} from './platform-operator';
import type { PlatformPermission } from './platform-permissions';

/**
 * Restricts a route to VendedorIA staff using a platform session who hold every listed
 * permission. No permissions: any operator. The global business guard skips these routes.
 */
export const PlatformPermissions = (...permissions: PlatformPermission[]) =>
  applyDecorators(
    SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions),
    UseGuards(PlatformAuthGuard),
    ApiBearerAuth(),
  );

export const CurrentOperator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformOperator => {
    const request = ctx.switchToHttp().getRequest<{ user: PlatformOperator }>();
    return request.user;
  },
);
