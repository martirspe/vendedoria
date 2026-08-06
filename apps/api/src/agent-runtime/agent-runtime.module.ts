import { Module } from '@nestjs/common';
import { SalesAgentRuntimeService } from './sales-agent-runtime.service';

@Module({
  providers: [SalesAgentRuntimeService],
  exports: [SalesAgentRuntimeService],
})
export class AgentRuntimeModule {}
