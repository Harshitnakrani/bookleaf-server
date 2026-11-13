import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { TriageWorker } from './triage.worker';
import { AiModule } from '../ai/ai.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Global()
@Module({
  imports: [AiModule, RealtimeModule],
  providers: [QueueService, TriageWorker],
  exports: [QueueService, TriageWorker],
})
export class QueueModule {}
