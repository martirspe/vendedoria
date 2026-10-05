import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { BillingModule } from '../billing/billing.module';
import { StorefrontModule } from '../storefront/storefront.module';
import {
  LiveController,
  TikTokIntegrationController,
  TikTokWebhookController,
} from './live.controller';
import { LIVE_INTEGRATION_ACCESS, TikTokLiveAdapter } from './live-adapter';
import { LiveService } from './live.service';
import { TikTokClient } from './tiktok-client';
import { TikTokIntegrationService } from './tiktok-integration.service';

@Module({
  imports: [AgentRuntimeModule, BillingModule, StorefrontModule],
  controllers: [
    LiveController,
    TikTokIntegrationController,
    TikTokWebhookController,
  ],
  providers: [
    LiveService,
    TikTokIntegrationService,
    TikTokClient,
    TikTokLiveAdapter,
    { provide: LIVE_INTEGRATION_ACCESS, useExisting: TikTokIntegrationService },
  ],
})
export class LiveModule {}
