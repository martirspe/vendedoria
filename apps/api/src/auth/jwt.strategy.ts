import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUserPayload } from '../common/types/auth-user';

type JwtPayload = {
  sub: string;
  email: string;
  tenantId?: string;
  membershipRole?: string;
  scope?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUserPayload {
    // Platform tokens share the signing secret but never grant access to business routes.
    if (payload.scope || !payload.tenantId || !payload.membershipRole) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      membershipRole: payload.membershipRole,
    };
  }
}
