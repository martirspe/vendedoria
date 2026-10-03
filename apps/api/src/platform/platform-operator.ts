import type { PlatformRole } from '@prisma/client';

export type PlatformOperator = {
  userId: string;
  email: string;
  platformRole: PlatformRole;
};

export const PLATFORM_PERMISSIONS_KEY = 'platformPermissions';
export const PLATFORM_TOKEN_SCOPE = 'platform';
export const PLATFORM_TOKEN_AUDIENCE = 'vendedoria-platform';
