import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('Business JWT membership authorization', () => {
  const findUnique = jest.fn();
  const strategy = new JwtStrategy(
    new ConfigService({
      JWT_ACCESS_SECRET: 'unit-test-signing-key-not-a-real-secret',
    }),
    { membership: { findUnique } } as unknown as PrismaService,
  );
  const payload = {
    sub: 'user-a',
    email: 'old@example.test',
    tenantId: 'tenant-a',
    membershipRole: 'ADMIN',
  };

  beforeEach(() => findUnique.mockReset());

  it('AUTH-001 uses the current role and identity instead of stale signed claims', async () => {
    findUnique.mockResolvedValue({
      role: 'AGENT',
      user: { email: 'current@example.test' },
    });
    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 'user-a',
      tenantId: 'tenant-a',
      membershipRole: 'AGENT',
      email: 'current@example.test',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: 'tenant-a', userId: 'user-a' } },
      select: { role: true, user: { select: { email: true } } },
    });
  });

  it('AUTH-002 denies a removed membership on the next request', async () => {
    findUnique
      .mockResolvedValueOnce({ role: 'ADMIN', user: { email: payload.email } })
      .mockResolvedValueOnce(null);
    await expect(strategy.validate(payload)).resolves.toMatchObject({
      membershipRole: 'ADMIN',
    });
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('TENANT-001 does not fall back to a membership in another tenant', async () => {
    findUnique.mockImplementation(
      ({ where }: { where: { tenantId_userId: { tenantId: string } } }) =>
        where.tenantId_userId.tenantId === 'tenant-a'
          ? { role: 'OWNER', user: { email: payload.email } }
          : null,
    );
    await expect(
      strategy.validate({ ...payload, tenantId: 'tenant-b' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    { ...payload, scope: 'platform' },
    { ...payload, sub: '' },
    { ...payload, tenantId: undefined },
    { ...payload, membershipRole: undefined },
  ])(
    'AUTH-003 rejects invalid business claims before database access: %j',
    async (claims) => {
      await expect(strategy.validate(claims)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('AUTH-004 does not grant access when the membership lookup fails', async () => {
    findUnique.mockRejectedValue(new Error('Database unavailable'));
    await expect(strategy.validate(payload)).rejects.toThrow(
      'Database unavailable',
    );
  });
});
