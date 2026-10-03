import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TurnstileController } from './turnstile.controller';
import { TurnstileGuard } from './turnstile.guard';
import { TurnstileService } from './turnstile.service';

/** Registered after `RateLimitModule` so floods are cut before any Siteverify call. */
@Module({
  controllers: [TurnstileController],
  providers: [TurnstileService, { provide: APP_GUARD, useClass: TurnstileGuard }],
  exports: [TurnstileService],
})
export class TurnstileModule {}
