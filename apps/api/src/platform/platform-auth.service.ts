import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PlatformRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { LoginDto } from '../auth/dto/auth.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformAuditService } from './platform-audit.service';
import { permissionsOf } from './platform-permissions';
import {
  PLATFORM_TOKEN_AUDIENCE,
  PLATFORM_TOKEN_SCOPE,
} from './platform-operator';

/** Compared when the email is unknown so response time does not reveal which accounts exist. */
const DUMMY_PASSWORD_HASH =
  '$2b$12$2aHr9kKnhnFi3YQqxP5wG.zIbXZ41HFtaopGAbt/dU/DRZF0MZTOu';
const ACCESS_TOKEN_SECONDS = 60 * 10;
const REFRESH_TOKEN_HOURS = 12;

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: PlatformAuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, passwordHash: true, platformRole: true },
    });
    const valid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid || !user.platformRole) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.audit.record({ actorUserId: user.id, action: 'platform.login' });
    return this.issueTokens(user.id, user.email, user.platformRole);
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: {
        user: { select: { id: true, email: true, platformRole: true } },
      },
    });
    if (
      !stored ||
      !stored.platform ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      !stored.user.platformRole
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.platformRole,
    );
  }

  /** Permissions let the console show only the actions the operator can perform. */
  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, platformRole: true },
    });
    const permissions = user.platformRole
      ? permissionsOf(user.platformRole)
      : [];
    return { ...user, permissions };
  }

  private async issueTokens(
    userId: string,
    email: string,
    platformRole: PlatformRole,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, scope: PLATFORM_TOKEN_SCOPE },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        audience: PLATFORM_TOKEN_AUDIENCE,
        expiresIn: ACCESS_TOKEN_SECONDS,
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_HOURS * 60 * 60 * 1000),
        platform: true,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: '10m',
      user: {
        id: userId,
        email,
        platformRole,
        permissions: permissionsOf(platformRole),
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
