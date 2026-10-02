import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { TenantsModule } from './tenants/tenants.module';
import { AgentsModule } from './agents/agents.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChannelsModule } from './channels/channels.module';
import { ConversationsModule } from './conversations/conversations.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { MetricsModule } from './metrics/metrics.module';
import { BillingModule } from './billing/billing.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { StorefrontModule } from './storefront/storefront.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    AgentsModule,
    KnowledgeModule,
    CatalogModule,
    ConversationsModule,
    ChannelsModule,
    PaymentsModule,
    OrdersModule,
    MetricsModule,
    BillingModule,
    StorefrontModule,
  ],
})
export class AppModule {}
