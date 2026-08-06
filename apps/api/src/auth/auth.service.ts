import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const slug = this.buildSlug(dto.businessName);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          fullName: dto.fullName,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: dto.businessName,
          slug: `${slug}-${user.id.slice(-6)}`,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'OWNER',
        },
      });

      await tx.salesAgent.create({
        data: {
          tenantId: tenant.id,
          name: 'Vendedor',
          companyName: dto.businessName,
          initialMessage: `¡Hola! Soy el vendedor IA de ${dto.businessName}. ¿En qué puedo ayudarte hoy?`,
          purchaseConfirmMessage:
            '¡Gracias por tu compra! Estamos procesando tu pedido.',
          handoffMessage:
            'Te conectaré con un agente humano para brindarte más ayuda.',
          communicationStyle: 'Amigable, cercano y conversacional',
          salesStyle: 'Consultiva, con foco en beneficios',
        },
      });

      return { user, tenant };
    });

    return this.issueTokens({
      userId: result.user.id,
      email: result.user.email,
      tenantId: result.tenant.id,
      membershipRole: 'OWNER',
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { memberships: { take: 1, orderBy: { createdAt: 'asc' } } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('No tenant membership found');
    }

    return this.issueTokens({
      userId: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      membershipRole: membership.role,
    });
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { memberships: { take: 1, orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const membership = stored.user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('No tenant membership found');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens({
      userId: stored.user.id,
      email: stored.user.email,
      tenantId: membership.tenantId,
      membershipRole: membership.role,
    });
  }

  private async issueTokens(payload: {
    userId: string;
    email: string;
    tenantId: string;
    membershipRole: string;
  }) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: payload.userId,
        email: payload.email,
        tenantId: payload.tenantId,
        membershipRole: payload.membershipRole,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: 60 * 15,
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const refreshDays = Number(
      this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS', '30'),
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshDays);

    await this.prisma.refreshToken.create({
      data: {
        userId: payload.userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: '15m',
      tenantId: payload.tenantId,
      user: {
        id: payload.userId,
        email: payload.email,
        role: payload.membershipRole,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }
}
