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

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /**
   * Submit a new support query (Author)
   */
  @Post()
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
  async getAiDraft(@Param('id') id: string) {
    return this.ticketsService.getAiDraftResponse(id);
  }

  /**
   * Post a reply or internal note in a ticket conversation
   */
  @Post(':id/messages')
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
  async retriggerTriage(@Param('id') id: string) {
    return this.ticketsService.retriggerTriage(id);
  }
}
