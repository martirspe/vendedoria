import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import type { AuthUserPayload } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, UpdateAccountDto } from './dto/account.dto';

export type AccountProfile = {
  id: string;
  email: string;
  fullName: string | null;
  role: MembershipRole;
  business: { name: string };
  memberSince: Date;
  activeSessions: number;
};

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async profile(user: AuthUserPayload): Promise<AccountProfile> {
    const [membership, activeSessions] = await Promise.all([
      this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: user.tenantId, userId: user.userId } },
        select: {
          role: true,
          tenant: { select: { name: true } },
          user: { select: { id: true, email: true, fullName: true, createdAt: true } },
        },
      }),
      this.prisma.refreshToken.count({
        where: { userId: user.userId, platform: false, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    if (!membership) {
      throw new NotFoundException('No encontramos tu cuenta en este negocio.');
    }
    return {
      id: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      role: membership.role,
      business: { name: membership.tenant.name },
      memberSince: membership.user.createdAt,
      activeSessions,
    };
  }

  async update(user: AuthUserPayload, dto: UpdateAccountDto): Promise<AccountProfile> {
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2) {
      throw new BadRequestException('Escribe tu nombre.');
    }
    await this.prisma.user.update({ where: { id: user.userId }, data: { fullName } });
    return this.profile(user);
  }

  /** Other devices are signed out; access tokens they already hold expire within 15 minutes. */
  async changePassword(user: AuthUserPayload, dto: ChangePasswordDto): Promise<{ revokedSessions: number }> {
    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { passwordHash: true },
    });
    if (!account || !(await bcrypt.compare(dto.currentPassword, account.passwordHash))) {
      throw new BadRequestException('Tu contraseña actual no es correcta.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: user.userId }, data: { passwordHash } });
    const revokedSessions = await this.auth.revokeOtherSessions(user.userId, dto.refreshToken);
    return { revokedSessions };
  }

  async revokeOtherSessions(user: AuthUserPayload, refreshToken: string): Promise<{ revokedSessions: number }> {
    return { revokedSessions: await this.auth.revokeOtherSessions(user.userId, refreshToken) };
  }
}
