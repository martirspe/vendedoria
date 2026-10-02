import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [AgentRuntimeModule, KnowledgeModule],
  controllers: [AgentsController],
  providers: [AgentsService, PlaygroundService],
})
export class AgentsModule {}
