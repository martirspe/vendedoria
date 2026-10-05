import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { BillingModule } from '../billing/billing.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MetaWhatsAppModule } from '../channels/meta-whatsapp.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { SalesInfrastructureModule } from '../agent-runtime/sales-infrastructure.module';
import { SalesGatewayService } from './sales-gateway.service';

@Module({
  imports: [AgentRuntimeModule, MetaWhatsAppModule, BillingModule, CatalogModule, CheckoutModule, SalesInfrastructureModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, SalesGatewayService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
