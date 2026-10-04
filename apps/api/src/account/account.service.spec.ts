import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { AuthService } from '../auth/auth.service';
import type { AuthUserPayload } from '../common/types/auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

const user: AuthUserPayload = {
  userId: 'user-1',
  email: 'ops@marca.com',
  tenantId: 'tenant-1',
  membershipRole: 'OWNER',
};

function setup(passwordHash = '') {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ passwordHash }),
      update: jest.fn().mockResolvedValue({}),
    },
    membership: {
      findUnique: jest.fn().mockResolvedValue({
        role: 'OWNER',
        tenant: { name: 'Mi Tienda' },
        user: { id: 'user-1', email: 'ops@marca.com', fullName: 'María Pérez', createdAt: new Date(0) },
      }),
    },
    refreshToken: { count: jest.fn().mockResolvedValue(2) },
  };
  const auth = { revokeOtherSessions: jest.fn().mockResolvedValue(1) };
  const service = new AccountService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  return { prisma, auth, service };
}

describe('AccountService', () => {
  it('reads the profile from the membership of the token tenant', async () => {
    const { prisma, service } = setup();
    const profile = await service.profile(user);
    expect(prisma.membership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId_userId: { tenantId: 'tenant-1', userId: 'user-1' } } }),
    );
    expect(profile).toMatchObject({ fullName: 'María Pérez', business: { name: 'Mi Tienda' }, activeSessions: 2 });
  });

  it('normalizes the name and rejects blank names', async () => {
    const { prisma, service } = setup();
    await service.update(user, { fullName: '  María   Pérez ' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { fullName: 'María Pérez' } });
    await expect(service.update(user, { fullName: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password only with the current one and keeps this device signed in', async () => {
    const { prisma, auth, service } = setup(await bcrypt.hash('actual-123', 4));

    await expect(
      service.changePassword(user, { currentPassword: 'otra-clave', newPassword: 'nueva-clave-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.changePassword(user, { currentPassword: 'actual-123', newPassword: 'actual-123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();

    const result = await service.changePassword(user, {
      currentPassword: 'actual-123',
      newPassword: 'nueva-clave-1',
      refreshToken: 'this-device',
    });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(auth.revokeOtherSessions).toHaveBeenCalledWith('user-1', 'this-device');
    expect(result).toEqual({ revokedSessions: 1 });
  });
});
