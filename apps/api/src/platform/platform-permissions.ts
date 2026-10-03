import type { PlatformRole } from '@prisma/client';

/**
 * Actions of the operations console. Routes require permissions, never roles, so a new role
 * (support, finance, read-only) is a new PlatformRole value plus one entry in ROLE_PERMISSIONS.
 */
export const PLATFORM_PERMISSIONS = [
  /** Businesses, stores, channels and their health. */
  'tenants.read',
  /** Suspend or reactivate a business or its store. */
  'tenants.suspend',
  /** Irreversible removal of a business and its data. */
  'tenants.delete',
  /** SaaS plan payments (flow A). Never buyer order payments. */
  'billing.read',
  /** Change plans, grant A medida, extend trials, refunds or credits (flow A). */
  'billing.grant',
  /** Time-boxed, audited assist session inside a business, with a reason. */
  'support.assist',
  /** Platform-wide credentials and integrations (Meta, payments, email). */
  'integrations.manage',
  'metrics.read',
  'audit.read',
  /** Grant, change or revoke operators from the console. */
  'operators.manage',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<
  PlatformRole,
  readonly PlatformPermission[]
> = {
  SUPERADMIN: PLATFORM_PERMISSIONS,
  ADMIN: [
    'tenants.read',
    'tenants.suspend',
    'billing.read',
    'support.assist',
    'metrics.read',
    'audit.read',
  ],
};

export function permissionsOf(
  role: PlatformRole,
): readonly PlatformPermission[] {
  return ROLE_PERMISSIONS[role];
}

/** True when the role holds every required permission; an empty list admits any operator. */
export function operatorCan(
  role: PlatformRole,
  required: readonly PlatformPermission[],
): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return required.every((permission) => granted.includes(permission));
}
