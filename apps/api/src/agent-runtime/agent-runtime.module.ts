import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { OrdersModule } from '../orders/orders.module';
import { SalesAgentRuntimeService } from './sales-agent-runtime.service';
import { SalesAgentToolsService } from './sales-agent-tools.service';

@Module({
  imports: [OrdersModule, KnowledgeModule],
  providers: [SalesAgentRuntimeService, SalesAgentToolsService],
  exports: [SalesAgentRuntimeService, SalesAgentToolsService],
})
export class AgentRuntimeModule {}
