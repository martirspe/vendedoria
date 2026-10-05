import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { TenantsModule } from './tenants/tenants.module';
import { AgentsModule } from './agents/agents.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChannelsModule } from './channels/channels.module';
import { ConversationsModule } from './conversations/conversations.module';
import { InboxEventsModule } from './conversations/inbox-events.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { MetricsModule } from './metrics/metrics.module';
import { BillingModule } from './billing/billing.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { StorefrontModule } from './storefront/storefront.module';
import { ShippingModule } from './shipping/shipping.module';
import { CouponsModule } from './coupons/coupons.module';
import { CheckoutModule } from './checkout/checkout.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { TurnstileModule } from './turnstile/turnstile.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TeamModule } from './team/team.module';
import { PlatformModule } from './platform/platform.module';
import { validateEnv } from './config/env.validation';
import { ConversionModule } from './conversion/conversion.module';
import { LiveModule } from './live/live.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    AccountModule,
    RateLimitModule,
    TurnstileModule,
    TenantsModule,
    AgentsModule,
    KnowledgeModule,
    CatalogModule,
    InboxEventsModule,
    ConversationsModule,
    ChannelsModule,
    PaymentsModule,
    OrdersModule,
    MetricsModule,
    BillingModule,
    StorefrontModule,
    ShippingModule,
    CouponsModule,
    CheckoutModule,
    ConversionModule,
    LiveModule,
    IntegrationsModule,
    TeamModule,
    PlatformModule,
  ],
})
export class AppModule {}
