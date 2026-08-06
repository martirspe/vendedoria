import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUserPayload } from '../common/types/auth-user';

type JwtPayload = {
  sub: string;
  email: string;
  tenantId: string;
  membershipRole: string;
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
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      membershipRole: payload.membershipRole,
    };
  }
}
