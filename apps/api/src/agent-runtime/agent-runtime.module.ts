import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { OrdersModule } from '../orders/orders.module';
import { SalesAgentRuntimeService } from './sales-agent-runtime.service';
import { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesInfrastructureModule } from './sales-infrastructure.module';
import { SalesToolRegistry } from './sales-tool-registry.service';
import { SalesEngineController } from './sales-engine.controller';
import { SalesEngineOpsService } from './sales-engine-ops.service';

@Module({
  imports: [OrdersModule, KnowledgeModule, SalesInfrastructureModule],
  controllers: [SalesEngineController],
  providers: [SalesAgentRuntimeService, SalesAgentToolsService, SalesToolRegistry, SalesEngineOpsService],
  exports: [SalesAgentRuntimeService, SalesAgentToolsService],
})
export class AgentRuntimeModule {}
