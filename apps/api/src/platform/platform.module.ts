import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformJwtStrategy } from './platform-jwt.strategy';
import {
  PlatformAuthController,
  PlatformController,
} from './platform.controller';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformAuthService, PlatformAuditService, PlatformJwtStrategy],
  exports: [PlatformAuditService],
})
export class PlatformModule {}
