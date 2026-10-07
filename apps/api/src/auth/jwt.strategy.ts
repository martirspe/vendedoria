import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUserPayload } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

type JwtPayload = {
  sub: string;
  email: string;
  tenantId?: string;
  membershipRole?: string;
  scope?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUserPayload> {
    // Platform tokens share the signing secret but never grant access to business routes.
    if (
      payload.scope ||
      !payload.sub ||
      !payload.tenantId ||
      !payload.membershipRole
    ) {
      throw new UnauthorizedException('Authentication required');
    }
    // Signed claims identify the membership; current database state grants access.
    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_userId: { tenantId: payload.tenantId, userId: payload.sub },
      },
      select: { role: true, user: { select: { email: true } } },
    });
    if (!membership) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      userId: payload.sub,
      email: membership.user.email,
      tenantId: payload.tenantId,
      membershipRole: membership.role,
    };
  }
}
