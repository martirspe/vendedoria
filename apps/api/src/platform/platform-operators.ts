import { Prisma, type PlatformRole, type PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export const PLATFORM_ROLES: readonly PlatformRole[] = ['SUPERADMIN', 'ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OperatorChange =
  | {
      kind: 'grant';
      email: string;
      role: PlatformRole;
      fullName?: string;
      /** Required to create the user; when the user exists it resets the password. */
      password?: string;
    }
  | { kind: 'revoke'; email: string };

export type OperatorChangeResult = { userId: string; actions: string[] };

export function assertOperatorEmail(email: string): void {
  if (!EMAIL_RE.test(email)) throw new Error('Email inválido.');
}

/** Operators can reach every business, so their passwords are stricter than the signup form's. */
export function assertOperatorPassword(password: string): void {
  if (password.length < 12)
    throw new Error('La contraseña debe tener al menos 12 caracteres.');
  if (Buffer.byteLength(password, 'utf8') > 72)
    throw new Error('La contraseña no puede superar 72 bytes.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error(
      'La contraseña debe incluir al menos una letra y un número.',
    );
  }
}

/**
 * Grants, changes or revokes a platform role. Every change is audited, the last SUPERADMIN
 * cannot be demoted, and platform sessions are revoked whenever the role or password changes.
 */
export async function applyOperatorChange(
  prisma: PrismaClient,
  change: OperatorChange,
): Promise<OperatorChangeResult> {
  const email = change.email.trim().toLowerCase();
  assertOperatorEmail(email);
  let passwordHash: string | undefined;
  if (change.kind === 'grant' && change.password !== undefined) {
    assertOperatorPassword(change.password);
    passwordHash = await bcrypt.hash(change.password, 12);
  }

  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, platformRole: true },
      });
      const audit = (
        userId: string,
        action: string,
        metadata?: Prisma.InputJsonObject,
      ) =>
        tx.platformAuditLog.create({
          data: { actorUserId: null, action, targetUserId: userId, metadata },
        });

      if (change.kind === 'revoke') {
        if (!user?.platformRole)
          throw new Error('Ese usuario no es operador de la plataforma.');
        await assertNotLastSuperadmin(tx, user.id, user.platformRole);
        await tx.user.update({
          where: { id: user.id },
          data: { platformRole: null },
        });
        await revokeSessions(tx, user.id, true);
        await audit(user.id, 'operator.revoked', { from: user.platformRole });
        return { userId: user.id, actions: ['operator.revoked'] };
      }

      if (!user) {
        if (!passwordHash)
          throw new Error('Para crear el usuario se necesita una contraseña.');
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: change.fullName,
            platformRole: change.role,
          },
        });
        await audit(created.id, 'operator.created', { role: change.role });
        return { userId: created.id, actions: ['operator.created'] };
      }

      const actions: string[] = [];
      if (user.platformRole !== change.role) {
        await assertNotLastSuperadmin(tx, user.id, user.platformRole);
        const action = user.platformRole
          ? 'operator.role_changed'
          : 'operator.granted';
        await audit(user.id, action, {
          from: user.platformRole,
          to: change.role,
        });
        actions.push(action);
      }
      if (passwordHash) {
        await audit(user.id, 'operator.password_reset');
        actions.push('operator.password_reset');
      }
      await tx.user.update({
        where: { id: user.id },
        data: {
          platformRole: change.role,
          ...(change.fullName ? { fullName: change.fullName } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      if (actions.length > 0) {
        // A new password ends every session; a role change only ends platform sessions.
        await revokeSessions(tx, user.id, !passwordHash);
      }
      return { userId: user.id, actions };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function assertNotLastSuperadmin(
  tx: Prisma.TransactionClient,
  userId: string,
  current: PlatformRole | null,
): Promise<void> {
  if (current !== 'SUPERADMIN') return;
  const others = await tx.user.count({
    where: { platformRole: 'SUPERADMIN', id: { not: userId } },
  });
  if (others === 0)
    throw new Error(
      'No se puede quitar el rol al último SUPERADMIN. Crea otro primero.',
    );
}

async function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  platformOnly: boolean,
) {
  await tx.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(platformOnly ? { platform: true } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
