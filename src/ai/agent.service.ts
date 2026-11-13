import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface AgentToolStep {
  toolName: string;
  arguments: any;
  result: any;
  timestamp: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private groqClient: Groq | null = null;
  private openAiClient: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly kbService: KnowledgeBaseService,
    private readonly realtimeService: RealtimeService,
  ) {
    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    if (groqKey) {
      this.groqClient = new Groq({ apiKey: groqKey });
      this.logger.log('Groq SDK initialized for Autonomous Agent Service');
    }

    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiKey) {
      this.openAiClient = new OpenAI({ apiKey: openAiKey });
    }
  }

  /**
   * Main entrypoint: Runs autonomous resolution loop for an author's submitted ticket.
   */
  async runAutonomousResolution(ticketId: string): Promise<{
    success: boolean;
    toolSteps: AgentToolStep[];
    resolutionMessage?: string;
    newStatus?: string;
    faultParty?: string;
  }> {
    this.logger.log(`🤖 Starting Autonomous AI Resolution for Ticket #${ticketId}`);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        author: true,
        book: true,
      },
    });

    if (!ticket) {
      this.logger.error(`Ticket #${ticketId} not found for agent resolution`);
      return { success: false, toolSteps: [] };
    }

    // Get or create BookLeaf AI system user for audit/messages
    let aiUser = await this.prisma.user.findFirst({
      where: { email: 'ai-agent@bookleaf.pub' },
    });

    if (!aiUser) {
      aiUser = await this.prisma.user.create({
        data: {
          name: 'BookLeaf AI Support Assistant',
          email: 'ai-agent@bookleaf.pub',
          password: 'DisabledPassword123!',
          role: 'ADMIN',
        },
      });
    }

    const toolSteps: AgentToolStep[] = [];
    let dispatchedMessage: string | null = null;
    let finalStatus: string = ticket.status;
    let recordedFaultParty: string | null = null;

    // 1. Define Tools
    const tools: any[] = [
      {
        type: 'function',
        function: {
          name: 'get_author_royalties_and_payouts',
          description:
            'Fetches author financial status, total copies sold, royalty earned, paid, pending, whether ₹1,000 threshold is reached, and bank account verification status.',
          parameters: {
            type: 'object',
            properties: {
              authorId: { type: 'string', description: 'Author ID' },
            },
            required: ['authorId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_book_publishing_and_inventory',
          description:
            'Fetches book title, ISBN, current production stage (Cover Design, Typesetting, Published & Live), print partner, distribution channels, and sales.',
          parameters: {
            type: 'object',
            properties: {
              bookId: { type: 'string', description: 'Book ID' },
              authorId: { type: 'string', description: 'Author ID' },
            },
            required: ['authorId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_bookleaf_policy_rules',
          description:
            'Queries official BookLeaf policy codex for royalty rules, reprint policies, ISBN guidelines, and resolution SLAs.',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Category: ROYALTY_AND_PAYMENTS, ISBN_AND_METADATA_ISSUES, PRINTING_AND_QUALITY, etc.',
              },
            },
            required: ['category'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'record_root_cause_analysis',
          description:
            'Records an operational finding in the database determining if the issue was BookLeaf fault/delay or author action needed.',
          parameters: {
            type: 'object',
            properties: {
              isBookLeafFault: { type: 'boolean', description: 'True if BookLeaf caused the issue/delay' },
              faultParty: {
                type: 'string',
                enum: ['BOOKLEAF', 'AUTHOR', 'DISTRIBUTOR', 'CARRIER', 'NO_FAULT'],
                description: 'Responsible party',
              },
              faultReason: { type: 'string', description: 'Detailed root cause explanation' },
              suggestedAction: { type: 'string', description: 'Concrete next step for operations team' },
            },
            required: ['isBookLeafFault', 'faultParty', 'faultReason', 'suggestedAction'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'resolve_and_dispatch_reply',
          description:
            'Saves the official empathetic resolution letter to the ticket thread and updates the ticket status.',
          parameters: {
            type: 'object',
            properties: {
              resolutionMessage: { type: 'string', description: 'Full response letter to the author' },
              newStatus: {
                type: 'string',
                enum: ['RESOLVED', 'IN_PROGRESS'],
                description: 'RESOLVED if fully addressed; IN_PROGRESS if escalating with a 48h SLA',
              },
              isFullyResolved: { type: 'boolean', description: 'True if no further operations action is pending' },
            },
            required: ['resolutionMessage', 'newStatus', 'isFullyResolved'],
          },
        },
      },
    ];

    const systemPrompt = `
You are BookLeaf Publishing's Autonomous Support Resolution Agent.
When a support ticket is submitted by an author, your mission is to:
1. INVESTIGATE: Use your tools to check real database facts (pending royalty figures, bank link status, book production stages, ISBNs).
2. CONSULT POLICY: Check BookLeaf's official policy slices (80/20 royalty split, ₹1,000 threshold, 45-day quarterly payout window, free reprints for defects).
3. ANALYZE ROOT CAUSE: Decide if the issue is BookLeaf's mistake/delay (e.g. overdue payout beyond 45 days, wrong ISBN on Amazon, or printing defects) vs author action required (e.g. bank details not linked, or royalty under the ₹1,000 floor). Call record_root_cause_analysis to save this in our database!
4. RESOLVE: Craft an empathetic, fact-filled resolution letter citing exact figures, book title, and clear next steps, and call resolve_and_dispatch_reply!

Communication Tone Rules:
- Greet author warmly by name.
- Acknowledge their concern with empathy upfront.
- Cite specific numbers (e.g. ₹3,450 pending, 200 copies sold) from the tools.
- If it is BookLeaf's delay, own it fully and provide an explicit 48-hour resolution SLA.
- Always sign as "Team BookLeaf Support".
`.trim();

    const userMessage = `
TICKET DETAILS:
- Ticket Number: ${ticket.ticketNumber}
- Ticket ID: ${ticket.id}
- Author Name: ${ticket.author.name} (Email: ${ticket.author.email}, ID: ${ticket.author.id})
- Subject: "${ticket.subject}"
- Description: "${ticket.description}"
- Associated Book ID: ${ticket.bookId || 'None (General Inquiry)'}

Investigate using your tools, analyze root cause, record findings to database, and dispatch a resolution.
`.trim();

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // 2. ReAct Agent Loop (Up to 5 turns)
    const MAX_TURNS = 5;
    let turn = 0;

    while (turn < MAX_TURNS) {
      turn++;
      this.logger.log(`🔄 Agent ReAct Loop Turn #${turn}`);

      let responseMessage: any = null;

      // Call Groq (primary) or OpenAI (fallback)
      if (this.groqClient) {
        try {
          const model =
            this.configService.get<string>('GROQ_MODEL') || 'openai/gpt-oss-120b';
          const completion = await this.groqClient.chat.completions.create({
            model,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
          });
          responseMessage = completion.choices[0]?.message;
        } catch (err) {
          this.logger.warn(`Groq agent turn failed: ${(err as Error).message}`);
        }
      }

      if (!responseMessage && this.openAiClient) {
        try {
          const model =
            this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
          const completion = await this.openAiClient.chat.completions.create({
            model,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
          });
          responseMessage = completion.choices[0]?.message;
        } catch (err) {
          this.logger.warn(`OpenAI agent turn failed: ${(err as Error).message}`);
        }
      }

      // If no LLM available, break to deterministic fallback
      if (!responseMessage) {
        break;
      }

      // If model returned tool calls, execute each tool and feed result back to Groq!
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const call of responseMessage.tool_calls) {
          const name = call.function.name;
          let args: any = {};
          try {
            args = JSON.parse(call.function.arguments);
          } catch (e) {
            args = {};
          }

          this.logger.log(`⚙️ Executing Agent Tool: ${name}`);
          let toolResult: any = null;

          if (name === 'get_author_royalties_and_payouts') {
            toolResult = await this.toolGetAuthorRoyalties(ticket.author.id);
          } else if (name === 'get_book_publishing_and_inventory') {
            toolResult = await this.toolGetBookDetails(ticket.bookId, ticket.author.id);
          } else if (name === 'check_bookleaf_policy_rules') {
            toolResult = this.toolCheckPolicy(args.category || ticket.category);
          } else if (name === 'record_root_cause_analysis') {
            toolResult = await this.toolRecordRootCause(ticket.id, args, aiUser.id);
            recordedFaultParty = args.faultParty;
          } else if (name === 'resolve_and_dispatch_reply') {
            toolResult = await this.toolDispatchReply(ticket.id, args, aiUser.id);
            dispatchedMessage = args.resolutionMessage;
            finalStatus = args.newStatus;
          } else {
            toolResult = { error: `Tool ${name} not recognized` };
          }

          toolSteps.push({
            toolName: name,
            arguments: args,
            result: toolResult,
            timestamp: new Date().toISOString(),
          });

          // Give output of tool back to Groq!
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(toolResult),
          });
        }

        // If the agent already dispatched the reply, it's done!
        if (dispatchedMessage) {
          this.logger.log(`✅ Agent successfully dispatched resolution in Turn #${turn}`);
          break;
        }
      } else {
        // Model provided final text response without tool call
        if (!dispatchedMessage && responseMessage.content) {
          dispatchedMessage = responseMessage.content;
          await this.toolDispatchReply(
            ticket.id,
            {
              resolutionMessage: dispatchedMessage || 'Resolution provided.',
              newStatus: 'RESOLVED',
              isFullyResolved: true,
            },
            aiUser.id,
          );
        }
        break;
      }
    }

    // Fallback if loop terminated without message: execute deterministic resolution
    if (!dispatchedMessage) {
      this.logger.warn(`Agent loop finished without dispatch, executing deterministic resolution fallback`);
      const fallbackResult = await this.executeFallbackResolution(ticket, aiUser.id);
      dispatchedMessage = fallbackResult.message;
      finalStatus = fallbackResult.status;
      recordedFaultParty = fallbackResult.faultParty;
      toolSteps.push(...fallbackResult.steps);
    }

    // Persist all tool steps in Ticket.aiToolSteps for admin inspection
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        aiToolSteps: toolSteps as any,
        isAiResolved: true,
      },
    });

    return {
      success: true,
      toolSteps,
      resolutionMessage: dispatchedMessage,
      newStatus: finalStatus,
      faultParty: recordedFaultParty || undefined,
    };
  }

  // --- TOOL IMPLEMENTATIONS ---

  private async toolGetAuthorRoyalties(authorId: string) {
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      include: { books: true },
    });

    if (!author) return { error: 'Author not found' };

    let totalEarned = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalSold = 0;

    for (const b of author.books) {
      totalEarned += Number(b.totalRoyaltyEarned || 0);
      totalPaid += Number(b.royaltyPaid || 0);
      totalPending += Number(b.royaltyPending || 0);
      totalSold += b.totalCopiesSold || 0;
    }

    const thresholdMet = totalPending >= 1000;

    return {
      authorName: author.name,
      email: author.email,
      isBankDetailsLinked: author.isBankDetailsLinked,
      bankAccountName: author.bankAccountName || null,
      bankAccountNumberMasked: author.bankAccountNumber
        ? `••••${author.bankAccountNumber.slice(-4)}`
        : null,
      totalCopiesSold: totalSold,
      totalRoyaltyEarned: totalEarned,
      royaltyPaid: totalPaid,
      royaltyPending: totalPending,
      minimumThreshold: 1000,
      thresholdMet,
      eligibleForQuarterlyPayout: thresholdMet && author.isBankDetailsLinked,
      payoutWindow: 'Royalties calculated quarterly and paid within 45 days of quarter end',
    };
  }

  private async toolGetBookDetails(bookId: string | null | undefined, authorId: string) {
    let book: any = null;
    if (bookId) {
      book = await this.prisma.book.findUnique({ where: { id: bookId } });
    } else {
      book = await this.prisma.book.findFirst({ where: { authorId } });
    }

    if (!book) return { message: 'No specific book edition associated' };

    return {
      bookId: book.bookId,
      title: book.title,
      isbn: book.isbn || 'Pending Allocation',
      status: book.status,
      genre: book.genre,
      mrp: Number(book.mrp || 0),
      authorRoyaltyPerCopy: Number(book.authorRoyaltyPerCopy || 0),
      totalCopiesSold: book.totalCopiesSold,
      royaltyPending: Number(book.royaltyPending || 0),
      printPartner: book.printPartner || 'In-House Delhi Warehouse',
      availableOn: book.availableOn,
      publicationDate: book.publicationDate,
    };
  }

  private toolCheckPolicy(category: string) {
    const slice = this.kbService.getKnowledgeSliceForCategory(category as any);
    return {
      policySlice: slice,
      summary:
        'BookLeaf 80/20 royalty split. ₹1,000 threshold. 45-day post-quarter payout. 5-7 days print turnaround. Free reprint for defective copies.',
    };
  }

  private async toolRecordRootCause(
    ticketId: string,
    args: {
      isBookLeafFault: boolean;
      faultParty: string;
      faultReason: string;
      suggestedAction: string;
    },
    performedById: string,
  ) {
    // 1. Update ticket with fault analysis
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        aiFaultParty: args.faultParty,
        aiFaultReason: args.faultReason,
        aiResolutionSummary: args.suggestedAction,
      },
    });

    // 2. Write to TicketAuditLog
    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId,
        userId: performedById,
        action: 'AI_ROOT_CAUSE_ANALYSIS',
        details: {
          faultParty: args.faultParty,
          faultReason: args.faultReason,
          suggestedAction: args.suggestedAction,
          isBookLeafFault: args.isBookLeafFault,
        },
      },
    });

    // 3. Create confidential internal ops note so human operators see the investigation
    await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: performedById,
        isInternalNote: true,
        isAiGenerated: true,
        content: `[AI ROOT CAUSE INVESTIGATION]
Fault Party: ${args.faultParty}
BookLeaf Mistake: ${args.isBookLeafFault ? 'YES (Accountability SLA Active)' : 'NO (External / Author Action)'}
Reason: ${args.faultReason}
Action Required: ${args.suggestedAction}`,
      },
    });

    return {
      status: 'RECORDED_IN_DATABASE',
      auditLogged: true,
      internalNoteCreated: true,
    };
  }

  private async toolDispatchReply(
    ticketId: string,
    args: {
      resolutionMessage: string;
      newStatus: string;
      isFullyResolved: boolean;
    },
    senderId: string,
  ) {
    // 1. Save message in DB
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        content: args.resolutionMessage,
        isInternalNote: false,
        isAiGenerated: true,
      },
    });

    // 2. Update ticket status
    const statusEnum = args.newStatus === 'RESOLVED' ? TicketStatus.RESOLVED : TicketStatus.IN_PROGRESS;
    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: statusEnum,
        isAiResolved: args.isFullyResolved,
        resolvedAt: args.isFullyResolved ? new Date() : undefined,
      },
      include: { author: true },
    });

    // 3. Emit real-time WebSocket / SSE event to author and admins
    this.realtimeService.emit({
      event: 'ticket:message',
      ticketId,
      recipientRole: 'ALL',
      authorId: ticket.authorId,
      data: {
        message,
        ticketId,
      },
    });

    this.realtimeService.emit({
      event: 'ticket:updated',
      ticketId,
      recipientRole: 'ALL',
      authorId: ticket.authorId,
      data: {
        ticketId,
        status: statusEnum,
        isAiResolved: args.isFullyResolved,
      },
    });

    return {
      status: 'DISPATCHED_TO_AUTHOR',
      messageId: message.id,
      ticketStatus: statusEnum,
    };
  }

  /**
   * Deterministic Fallback if external LLM APIs fail completely
   */
  private async executeFallbackResolution(ticket: any, aiUserId: string) {
    const authorRoyalties: any = await this.toolGetAuthorRoyalties(ticket.author.id);
    const bookDetails: any = await this.toolGetBookDetails(ticket.bookId, ticket.author.id);

    const isRoyaltyQuery =
      ticket.category === 'ROYALTY_AND_PAYMENTS' ||
      ticket.subject.toLowerCase().includes('royalt') ||
      ticket.description.toLowerCase().includes('royalt');

    const pendingRoyalty: number =
      typeof authorRoyalties?.royaltyPending === 'number' ? authorRoyalties.royaltyPending : 0;
    const isBankLinked: boolean = !!authorRoyalties?.isBankDetailsLinked;
    const copiesSold: number =
      typeof authorRoyalties?.totalCopiesSold === 'number' ? authorRoyalties.totalCopiesSold : 0;
    const bankName: string = authorRoyalties?.bankAccountName || 'Verified Account';

    let faultParty = 'NO_FAULT';
    let faultReason = 'Operational inquiry addressed with catalog facts';
    let action = 'No further operational action required';
    let resolutionMessage = '';
    let status = 'RESOLVED';

    if (isRoyaltyQuery) {
      if (!isBankLinked) {
        faultParty = 'AUTHOR';
        faultReason = 'Bank account details have not been linked in the author dashboard';
        action = 'Author must link bank account to receive quarterly transfer';
        resolutionMessage = `Dear ${ticket.author.name},

Thank you for reaching out to BookLeaf Publishing regarding your royalty status.

We have reviewed your account records. Currently, you have an accrued royalty balance of ₹${pendingRoyalty.toLocaleString('en-IN')}. However, our records show that your bank account details have not yet been linked in your author dashboard.

Under BookLeaf policy, royalties are calculated quarterly and distributed via direct bank transfer. To ensure your payout is processed in the upcoming disbursement cycle, please log in to your Author Studio and link your bank account details.

If you need any guidance updating your account, please reply directly to this thread and we will assist you.

Warm regards,  
Team BookLeaf Support`;
      } else if (pendingRoyalty < 1000) {
        faultParty = 'AUTHOR';
        faultReason = 'Accrued royalties (₹' + pendingRoyalty + ') are below the minimum ₹1,000 disbursement threshold';
        action = 'Royalties will roll over to the subsequent quarter per contract policy';
        resolutionMessage = `Dear ${ticket.author.name},

Thank you for reaching out regarding your book royalties.

We have audited your sales statement across all distribution channels. Your current pending royalty is ₹${pendingRoyalty.toLocaleString('en-IN')} across ${copiesSold} copies sold.

Under BookLeaf's 80/20 royalty agreement, the minimum payout threshold for quarterly disbursement is ₹1,000. Because your current balance is below this floor, your earnings will automatically roll over to the next quarter and accumulate toward your payout.

You can monitor your real-time unit sales and threshold progress directly in your Author Studio. Please let us know if you would like a detailed line-by-line sales report.

Warm regards,  
Team BookLeaf Support`;
      } else {
        faultParty = 'BOOKLEAF';
        faultReason = 'Royalty threshold met (₹' + pendingRoyalty + ') and bank verified, but disbursement was delayed beyond 45-day window';
        action = 'Escalated to finance operations for emergency manual wire transfer within 48 business hours';
        status = 'IN_PROGRESS';
        resolutionMessage = `Dear ${ticket.author.name},

Thank you for bringing this to our attention. We understand your concern and sincerely apologize for the delay.

We have investigated your account and confirmed that you have an eligible pending royalty of ₹${pendingRoyalty.toLocaleString('en-IN')}, and your bank account (${bankName}) is properly linked. Because this transfer was delayed past our standard 45-day quarterly window, we have taken immediate accountability.

Our operations team has escalated this to our finance department for an expedited manual wire transfer. You will receive a direct confirmation with your bank transaction reference number within 48 hours.

Thank you for your patience and partnership with BookLeaf.

Warm regards,  
Team BookLeaf Support`;
      }
    } else {
      resolutionMessage = `Dear ${ticket.author.name},

Thank you for contacting BookLeaf Publishing regarding "${ticket.subject}".

We have received your query regarding ${bookDetails.title ? `"${bookDetails.title}"` : 'your account'}. Our automated operations engine has reviewed your publication records and confirmed your request is under active review in our operations ledger.

Our standard resolution SLA for ${ticket.category.replace(/_/g, ' ')} is 24 to 48 business hours. If any photos or additional documentation are needed, our team will notify you directly here.

Thank you for publishing with BookLeaf!

Warm regards,  
Team BookLeaf Support`;
    }

    await this.toolRecordRootCause(
      ticket.id,
      {
        isBookLeafFault: faultParty === 'BOOKLEAF',
        faultParty,
        faultReason,
        suggestedAction: action,
      },
      aiUserId,
    );

    await this.toolDispatchReply(
      ticket.id,
      {
        resolutionMessage,
        newStatus: status,
        isFullyResolved: status === 'RESOLVED',
      },
      aiUserId,
    );

    return {
      message: resolutionMessage,
      status,
      faultParty,
      steps: [
        {
          toolName: 'fallback_deterministic_resolution',
          arguments: { isRoyaltyQuery, faultParty },
          result: { faultReason, action },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
