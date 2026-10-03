import { ForbiddenException } from '@nestjs/common';
import type { AuthUserPayload } from './types/auth-user';

/** Roles that manage the business: plan, integrations and team. AGENT only attends chats and orders. */
export const MANAGER_ROLES = ['OWNER', 'ADMIN'];

export function assertManager(user: AuthUserPayload, message: string): void {
  if (!MANAGER_ROLES.includes(user.membershipRole)) {
    throw new ForbiddenException(message);
  }
}
