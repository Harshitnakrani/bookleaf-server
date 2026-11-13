import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { OverrideTicketDto } from './dto/override-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Support Tickets & AI Resolution')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /**
   * Submit a new support query (Author)
   */
  @Post()
  @ApiOperation({
    summary: 'Submit Support Ticket (Author)',
    description:
      'Submits a new author ticket. Persists immediately to PostgreSQL, queues BullMQ auto-triage, and triggers the AI autonomous resolution ReAct loop.',
  })
  @ApiResponse({ status: 201, description: 'Ticket created and enqueued for AI triage' })
  @ApiResponse({ status: 400, description: 'Validation failure' })
  @ApiResponse({ status: 403, description: 'Author does not own the associated book' })
  async createTicket(
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketsService.createTicket(authorId, dto);
  }

  /**
   * List tickets:
   * - Authors receive their submitted tickets.
   * - Admins receive the global Ticket Queue with status, category, priority filters and urgency sorting.
   */
  @Get()
  @ApiOperation({
    summary: 'List Tickets',
    description:
      'Authors receive their own ticket list. Admins receive global queue with multi-dimensional filtering, full-text search, and urgency sorting.',
  })
  @ApiResponse({ status: 200, description: 'List of tickets with author metadata and counts' })
  async getTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTicketsDto,
  ) {
    return this.ticketsService.getTickets(user, query);
  }

  /**
   * Single ticket details & conversation thread
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get Ticket Details & Thread',
    description: 'Retrieves complete ticket conversation, AI tool audit steps, and root-cause analysis findings',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Ticket details, messages, and audit trail' })
  @ApiResponse({ status: 403, description: 'Forbidden: Author does not own ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicketById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.getTicketById(id, user);
  }

  /**
   * AI-Drafted Response (Admin-only, On-demand with Valkey caching)
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id/ai-draft')
  @ApiOperation({
    summary: 'Generate AI Reply Draft (Admin)',
    description: 'Generates empathetic draft grounded in author data and BookLeaf policies (cached in Redis/Valkey)',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'AI drafted empathetic response with suggested actions' })
  @ApiResponse({ status: 403, description: 'Requires ADMIN role' })
  async getAiDraft(@Param('id') id: string) {
    return this.ticketsService.getAiDraftResponse(id);
  }

  /**
   * Post a reply or internal note in a ticket conversation
   */
  @Post(':id/messages')
  @ApiOperation({
    summary: 'Post Message or Internal Note',
    description: 'Appends a response to ticket thread or records a private ops team note (hidden from author)',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 201, description: 'Message created and broadcasted via WebSockets' })
  async addMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMessageDto,
  ) {
    return this.ticketsService.addMessage(id, user, dto);
  }

  /**
   * Admin: Update ticket status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update Ticket Status (Admin)',
    description: 'Updates ticket lifecycle state and emits real-time status update',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ticketsService.updateStatus(id, user, dto.status);
  }

  /**
   * Admin: Override AI category and/or priority score
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/override')
  @ApiOperation({
    summary: 'Override AI Classification (Admin)',
    description: 'Human operator override for AI category or priority, logging an audit record',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Overrides applied and audit logged' })
  async overrideTicket(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OverrideTicketDto,
  ) {
    return this.ticketsService.overrideTicket(id, user, dto);
  }

  /**
   * Admin: Assign ticket to self or teammate
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Assign Ticket to Operator (Admin)',
    description: 'Assigns ticket to an operations specialist or clears assignment',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Ticket assignment updated' })
  async assignTicket(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignTicketDto,
  ) {
    return this.ticketsService.assignTicket(id, user, dto.assignedToId);
  }

  /**
   * Admin: Manually trigger re-classification via AI
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/ai-reclassify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-trigger AI Triage (Admin)',
    description: 'Re-executes AI classification, priority scoring, and autonomous investigation',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'AI triage re-executed' })
  async retriggerTriage(@Param('id') id: string) {
    return this.ticketsService.retriggerTriage(id);
  }

  /**
   * Run Autonomous AI Resolution agent on ticket (Investigation, DB writes, Root cause, Reply)
   */
  @Post(':id/ai-resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger AI Autonomous Resolution Loop',
    description:
      'Executes multi-turn ReAct agent loop: investigates database facts, checks BookLeaf policies, records root cause to PostgreSQL, and dispatches empathetic resolution letter.',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Autonomous agent resolution completed' })
  async runAiResolution(@Param('id') id: string) {
    return this.ticketsService.runAiResolution(id);
  }
}
