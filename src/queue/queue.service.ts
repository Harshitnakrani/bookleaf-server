import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export interface TriageJobData {
  ticketId: string;
  subject: string;
  description: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private triageQueue: Queue<TriageJobData> | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl =
      this.configService.get<string>('VALKEY_URL') ||
      this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.logger.warn('No Valkey/Redis URL for BullMQ. In-process fallback enabled.');
      return;
    }

    try {
      const parsedUrl = new URL(redisUrl);
      const isTls = redisUrl.startsWith('rediss://');

      this.triageQueue = new Queue<TriageJobData>('ticket-triage', {
        connection: {
          host: parsedUrl.hostname,
          port: parseInt(parsedUrl.port || '6379', 10),
          username: parsedUrl.username || 'default',
          password: parsedUrl.password || undefined,
          tls: isTls ? { rejectUnauthorized: false } : undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1500,
          },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      });

      this.isConnected = true;
      this.logger.log('BullMQ ticket-triage queue initialized successfully');
    } catch (err) {
      this.logger.warn(
        `Failed to initialize BullMQ queue: ${(err as Error).message}. Will use in-process async fallback.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.triageQueue) {
      await this.triageQueue.close();
    }
  }

  /**
   * Enqueues an auto-triage job to BullMQ
   */
  async addTriageJob(data: TriageJobData): Promise<boolean> {
    if (this.triageQueue && this.isConnected) {
      try {
        await this.triageQueue.add('triage', data, {
          jobId: `triage-${data.ticketId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        });
        this.logger.log(`Enqueued triage job for ticket ${data.ticketId} in BullMQ`);
        return true;
      } catch (err) {
        this.logger.warn(
          `Failed to push BullMQ job: ${(err as Error).message}. Falling back to in-process execution.`,
        );
        return false;
      }
    }
    return false;
  }

  isQueueAvailable(): boolean {
    return this.isConnected && this.triageQueue !== null;
  }
}
