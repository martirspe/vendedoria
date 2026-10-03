import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoginDto, RefreshTokenDto } from '../auth/dto/auth.dto';
import { Public } from '../common/decorators/auth.decorators';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { Turnstile } from '../turnstile/turnstile.decorator';
import { PlatformAuthService } from './platform-auth.service';
import type { PlatformOperator } from './platform-operator';
import {
  CurrentOperator,
  PlatformPermissions,
} from './platform-permissions.decorator';

/** VendedorIA staff sessions. Separate from business sessions: neither token works on the other side. */
@ApiTags('platform')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuth: PlatformAuthService) {}

  @Public()
  @RateLimit('platform-login', 5)
  @Turnstile('platform-login')
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.platformAuth.login(dto);
  }

  @Public()
  @RateLimit('platform-refresh', 30)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.platformAuth.refresh(dto.refreshToken);
  }
}

@ApiTags('platform')
@PlatformPermissions()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformAuth: PlatformAuthService) {}

  @Get('me')
  me(@CurrentOperator() operator: PlatformOperator) {
    return this.platformAuth.me(operator.userId);
  }
}
