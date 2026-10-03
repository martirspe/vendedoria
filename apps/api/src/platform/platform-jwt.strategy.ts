import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  PLATFORM_TOKEN_AUDIENCE,
  PLATFORM_TOKEN_SCOPE,
  type PlatformOperator,
} from './platform-operator';

type PlatformJwtPayload = {
  sub: string;
  scope?: string;
};

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  'platform-jwt',
) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      audience: PLATFORM_TOKEN_AUDIENCE,
    });
  }

  /** The role is read from the database so revoking it takes effect on the next request. */
  async validate(payload: PlatformJwtPayload): Promise<PlatformOperator> {
    if (payload.scope !== PLATFORM_TOKEN_SCOPE || !payload.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, platformRole: true },
    });
    if (!user?.platformRole) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
    };
  }
}
