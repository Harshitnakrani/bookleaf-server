import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AgentService } from './agent.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Global()
@Module({
  imports: [KnowledgeBaseModule],
  providers: [AiService, AgentService],
  exports: [AiService, AgentService],
})
export class AiModule {}
