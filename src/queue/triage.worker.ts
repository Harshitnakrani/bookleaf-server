import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TriageJobData } from './queue.service';

@Injectable()
export class TriageWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TriageWorker.name);
  private worker: Worker<TriageJobData> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly realtimeService: RealtimeService,
  ) {}

  onModuleInit() {
    const redisUrl =
      this.configService.get<string>('VALKEY_URL') ||
      this.configService.get<string>('REDIS_URL');

    if (!redisUrl) return;

    try {
      const parsedUrl = new URL(redisUrl);
      const isTls = redisUrl.startsWith('rediss://');

      this.worker = new Worker<TriageJobData>(
        'ticket-triage',
        async (job: Job<TriageJobData>) => {
          this.logger.log(
            `BullMQ processing triage job #${job.id} for ticket: ${job.data.ticketId}`,
          );
          await this.processTriage(job.data);
        },
        {
          connection: {
            host: parsedUrl.hostname,
            port: parseInt(parsedUrl.port || '6379', 10),
            username: parsedUrl.username || 'default',
            password: parsedUrl.password || undefined,
            tls: isTls ? { rejectUnauthorized: false } : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
          concurrency: 5,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Triage job #${job.id} completed successfully`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.warn(
          `Triage job #${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`,
        );
      });
    } catch (err) {
      this.logger.warn(`Failed to start BullMQ worker: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  /**
   * Core logic for AI triage execution, updating database and broadcasting real-time events
   */
  async processTriage(data: TriageJobData): Promise<void> {
    const { ticketId, subject, description } = data;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { author: true },
    });

    if (!ticket) {
      this.logger.warn(`Ticket not found for triage: ${ticketId}`);
      return;
    }

    try {
      // 1. Call AI service for structured classification & scoring
      const result = await this.aiService.classifyAndScoreTicket(
        subject,
        description,
      );

      // 2. Prepare update payload (respecting admin overrides if any occurred prior)
      const updateData: any = {
        aiCategory: result.category,
        aiPriority: result.priority,
        aiReasoning: result.reasoning,
        aiConfidence: result.confidence,
      };

      if (!ticket.isCategoryOverridden) {
        updateData.category = result.category;
      }

      if (!ticket.isPriorityOverridden) {
        updateData.priority = result.priority;
      }

      const updatedTicket = await this.prisma.ticket.update({
        where: { id: ticketId },
        data: updateData,
        include: {
          author: {
            select: { id: true, name: true, email: true, authorId: true },
          },
          book: {
            select: { id: true, bookId: true, title: true, isbn: true },
          },
        },
      });

      // 3. Log audit event
      await this.prisma.ticketAuditLog.create({
        data: {
          ticketId,
          action: 'AI_CLASSIFIED',
          details: {
            aiCategory: result.category,
            aiPriority: result.priority,
            reasoning: result.reasoning,
            confidence: result.confidence,
          },
        },
      });

      // 4. Broadcast real-time event to Admin Portal queue & Author ticket view
      this.realtimeService.emit({
        event: 'ticket:triaged',
        ticketId,
        authorId: ticket.authorId,
        recipientRole: 'ALL',
        data: {
          ticketId,
          ticketNumber: ticket.ticketNumber,
          category: updatedTicket.category,
          aiCategory: updatedTicket.aiCategory,
          priority: updatedTicket.priority,
          aiPriority: updatedTicket.aiPriority,
          aiReasoning: updatedTicket.aiReasoning,
        },
      });

      this.logger.log(
        `Ticket ${ticket.ticketNumber} triaged -> Category: ${result.category}, Priority: ${result.priority}`,
      );
    } catch (err) {
      this.logger.error(`Error during triage of ${ticketId}: ${(err as Error).message}`);
      throw err;
    }
  }
}
