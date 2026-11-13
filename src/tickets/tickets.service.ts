import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role, TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { TriageWorker } from '../queue/triage.worker';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '../redis/redis.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { OverrideTicketDto } from './dto/override-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly triageWorker: TriageWorker,
    private readonly aiService: AiService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * 1. Submit a support ticket (Author)
   * Saves to PostgreSQL immediately -> Enqueues BullMQ triage job -> Broadcasts real-time event
   */
  async createTicket(authorId: string, dto: CreateTicketDto) {
    const { subject, description, bookId, attachmentUrl, attachmentName } = dto;

    // Verify book belongs to author if bookId provided
    if (bookId) {
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
      });
      if (!book) {
        throw new NotFoundException(`Book with ID "${bookId}" not found`);
      }
      if (book.authorId !== authorId) {
        throw new ForbiddenException('You can only raise queries for your own books');
      }
    }

    // Generate human-readable ticket number (e.g. TICK-1042)
    const ticketCount = await this.prisma.ticket.count();
    const ticketNumber = `TICK-${1000 + ticketCount + 1}`;

    // Insert into PostgreSQL immediately so query is never lost
    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber,
        subject: subject.trim(),
        description: description.trim(),
        authorId,
        bookId: bookId || null,
        attachmentUrl: attachmentUrl || null,
        attachmentName: attachmentName || null,
        status: TicketStatus.OPEN,
        category: TicketCategory.GENERAL_INQUIRY,
        priority: TicketPriority.MEDIUM,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, authorId: true },
        },
        book: {
          select: { id: true, bookId: true, title: true, isbn: true },
        },
      },
    });

    // Record audit event
    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId: ticket.id,
        userId: authorId,
        action: 'TICKET_CREATED',
        details: { subject: ticket.subject, bookId: ticket.bookId },
      },
    });

    // Broadcast new ticket event to Admin Portal queue instantly via WebSocket/SSE
    this.realtimeService.emit({
      event: 'ticket:created',
      ticketId: ticket.id,
      recipientRole: 'ADMIN',
      data: ticket,
    });

    // Enqueue auto-triage job to BullMQ
    const triageData = {
      ticketId: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
    };

    let enqueued = false;
    if (this.queueService.isQueueAvailable()) {
      enqueued = await this.queueService.addTriageJob(triageData);
    }

    if (!enqueued) {
      // In-process asynchronous fallback
      setImmediate(() => {
        this.triageWorker.processTriage(triageData).catch((err) => {
          this.logger.error(`Fallback triage failed: ${err.message}`);
        });
      });
    }

    return ticket;
  }

  /**
   * 2. List tickets with role-based filtering, search, and urgency sorting
   */
  async getTickets(user: AuthenticatedUser, query: QueryTicketsDto) {
    const {
      status,
      category,
      priority,
      authorId,
      assignedToId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = '1',
      limit = '20',
    } = query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // Authors can ONLY see their own tickets
    if (user.role === Role.AUTHOR) {
      where.authorId = user.id;
    } else {
      // Admin filters
      if (authorId) where.authorId = authorId;
      if (assignedToId) {
        where.assignedToId = assignedToId === 'unassigned' ? null : assignedToId;
      }
    }

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    if (search) {
      where.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { author: { name: { contains: search, mode: 'insensitive' } } },
        { book: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Determine ordering
    let orderBy: any = {};
    if (sortBy === 'urgency') {
      // Urgency sorting for ops team: priority first (Critical -> High -> Med -> Low), then oldest
      orderBy = [{ priority: 'asc' }, { createdAt: 'asc' }];
    } else {
      orderBy = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc' };
    }

    const [total, tickets] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        include: {
          author: {
            select: { id: true, name: true, email: true, authorId: true },
          },
          book: {
            select: { id: true, bookId: true, title: true, isbn: true, status: true },
          },
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
    ]);

    return {
      data: tickets,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * 3. Ticket details view
   * Authors see their own ticket, with internal notes hidden.
   * Admins see complete ticket thread and AI audit logs.
   */
  async getTicketById(id: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            authorId: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            isBankDetailsLinked: true,
            bankAccountName: true,
          },
        },
        book: true,
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, name: true, role: true, authorId: true },
            },
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${id}" not found`);
    }

    // Role check
    if (user.role === Role.AUTHOR && ticket.authorId !== user.id) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    // Author security: Filter out internal notes
    if (user.role === Role.AUTHOR) {
      ticket.messages = ticket.messages.filter((m) => !m.isInternalNote);
    }

    return ticket;
  }

  /**
   * 4. AI-Drafted Response (On-demand with Valkey caching)
   * Checks Valkey cache (draft:ticketId) -> If miss, generates via AI -> Caches with 1h TTL
   */
  async getAiDraftResponse(ticketId: string) {
    const cacheKey = `draft:${ticketId}`;

    // Check Valkey cache first to save tokens & latency
    const cachedDraft = await this.redisService.get(cacheKey);
    if (cachedDraft) {
      this.logger.log(`Cache HIT for AI draft: ${ticketId}`);
      return {
        aiAvailable: true,
        draft: cachedDraft,
        isCached: true,
      };
    }

    // Cache Miss: Fetch ticket details with author, book, and recent messages
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        author: true,
        book: true,
        messages: {
          where: { isInternalNote: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { sender: { select: { role: true } } },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);
    }

    const recentMessages = ticket.messages
      .reverse()
      .map((m) => ({
        senderRole: m.sender.role,
        content: m.content,
        createdAt: m.createdAt,
      }));

    // Call AI service with targeted category KB slice and author stats
    const aiResult = await this.aiService.generateDraftResponse({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
      },
      author: {
        name: ticket.author.name,
        email: ticket.author.email,
        isBankDetailsLinked: ticket.author.isBankDetailsLinked,
        bankAccountName: ticket.author.bankAccountName,
      },
      book: ticket.book,
      recentMessages,
    });

    if (aiResult.draft) {
      // Store draft in Valkey with 1-hour TTL (3600 seconds)
      await this.redisService.set(cacheKey, aiResult.draft, 3600);

      // Save draft directly to ticket record for persistence
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          aiDraftResponse: aiResult.draft,
          aiDraftGeneratedAt: new Date(),
        },
      });
    }

    return {
      aiAvailable: aiResult.aiAvailable,
      draft: aiResult.draft,
      isCached: false,
      modelUsed: aiResult.modelUsed,
    };
  }

  /**
   * 5. Send message or internal note on a ticket thread
   * If admin sends reply: saves DB -> deletes Valkey draft cache -> pushes real-time update to author
   */
  async addMessage(
    ticketId: string,
    user: AuthenticatedUser,
    dto: CreateMessageDto,
  ) {
    const { content, isInternalNote = false } = dto;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);
    }

    // Role check: Author can only message their own ticket
    if (user.role === Role.AUTHOR && ticket.authorId !== user.id) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    // Authors cannot write internal notes
    const effectiveIsInternal = user.role !== Role.AUTHOR && Boolean(isInternalNote);

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: user.id,
        content: content.trim(),
        isInternalNote: effectiveIsInternal,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true, authorId: true },
        },
      },
    });

    // If an Admin sends a public response:
    if (user.role !== Role.AUTHOR && !effectiveIsInternal) {
      // Invalidate Valkey draft cache so subsequent requests regenerate or refresh
      await this.redisService.del(`draft:${ticketId}`);

      // Auto-update ticket status to IN_PROGRESS if currently OPEN
      if (ticket.status === TicketStatus.OPEN) {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.IN_PROGRESS },
        });
      }

      // Record audit log
      await this.prisma.ticketAuditLog.create({
        data: {
          ticketId,
          userId: user.id,
          action: 'ADMIN_REPLIED',
          details: { messageId: message.id },
        },
      });

      // Broadcast real-time message notification to Author's ticket view
      this.realtimeService.emit({
        event: 'ticket:message',
        ticketId,
        authorId: ticket.authorId,
        data: message,
      });
    } else if (user.role === Role.AUTHOR) {
      // If author replies and ticket was RESOLVED/CLOSED, reopen ticket
      if (
        ticket.status === TicketStatus.RESOLVED ||
        ticket.status === TicketStatus.CLOSED
      ) {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.IN_PROGRESS },
        });
      }

      // Broadcast real-time message notification to Admins
      this.realtimeService.emit({
        event: 'ticket:message',
        ticketId,
        recipientRole: 'ADMIN',
        data: message,
      });
    }

    return message;
  }

  /**
   * 6. Update ticket status (Admin)
   */
  async updateStatus(
    ticketId: string,
    user: AuthenticatedUser,
    status: TicketStatus,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);
    }

    const updateData: any = { status };
    if (status === TicketStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    } else if (status === TicketStatus.CLOSED) {
      updateData.closedAt = new Date();
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
    });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId,
        userId: user.id,
        action: 'STATUS_UPDATED',
        details: { oldStatus: ticket.status, newStatus: status },
      },
    });

    this.realtimeService.emit({
      event: 'ticket:updated',
      ticketId,
      authorId: ticket.authorId,
      recipientRole: 'ALL',
      data: { ticketId, status },
    });

    return updated;
  }

  /**
   * 7. Override AI classification and/or priority score (Admin)
   */
  async overrideTicket(
    ticketId: string,
    user: AuthenticatedUser,
    dto: OverrideTicketDto,
  ) {
    const { category, priority } = dto;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);
    }

    const updateData: any = {};
    if (category) {
      updateData.category = category;
      updateData.isCategoryOverridden = true;
      // Invalidate draft cache since category slice changed!
      await this.redisService.del(`draft:${ticketId}`);
    }

    if (priority) {
      updateData.priority = priority;
      updateData.isPriorityOverridden = true;
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
    });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId,
        userId: user.id,
        action: 'AI_OVERRIDDEN',
        details: {
          categoryOverride: category || null,
          priorityOverride: priority || null,
        },
      },
    });

    this.realtimeService.emit({
      event: 'ticket:updated',
      ticketId,
      authorId: ticket.authorId,
      recipientRole: 'ALL',
      data: { ticketId, category: updated.category, priority: updated.priority },
    });

    return updated;
  }

  /**
   * 8. Assign ticket to admin (Admin)
   */
  async assignTicket(
    ticketId: string,
    user: AuthenticatedUser,
    assignedToId?: string | null,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);
    }

    if (assignedToId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: assignedToId },
      });
      if (!assignee) {
        throw new NotFoundException(`Assignee with ID "${assignedToId}" not found`);
      }
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedToId: assignedToId || null },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId,
        userId: user.id,
        action: 'TICKET_ASSIGNED',
        details: { assignedToId },
      },
    });

    this.realtimeService.emit({
      event: 'ticket:updated',
      ticketId,
      recipientRole: 'ADMIN',
      data: { ticketId, assignedTo: updated.assignedTo },
    });

    return updated;
  }

  /**
   * 9. Manually re-trigger AI triage (Admin)
   */
  async retriggerTriage(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);
    }

    await this.triageWorker.processTriage({
      ticketId: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
    });

    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
  }
}
