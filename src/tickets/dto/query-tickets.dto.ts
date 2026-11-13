import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

export class QueryTicketsDto {
  @ApiPropertyOptional({
    enum: TicketStatus,
    description: 'Filter tickets by status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)',
  })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({
    enum: TicketCategory,
    description: 'Filter tickets by query category',
  })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional({
    enum: TicketPriority,
    description: 'Filter tickets by priority (CRITICAL, HIGH, MEDIUM, LOW)',
  })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({
    description: 'Filter tickets submitted by a specific author ID',
  })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({
    description: 'Filter tickets assigned to a specific operator ID',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Full-text search query across ticket number, subject, description, and author name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['urgency', 'priority', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    description: 'Sort criteria (urgency combines priority weight and submission age)',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'urgency' | 'priority' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'desc',
    description: 'Sort direction',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    example: '1',
    default: '1',
    description: 'Pagination page number',
  })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    example: '20',
    default: '20',
    description: 'Pagination items per page limit',
  })
  @IsOptional()
  @IsString()
  limit?: string;
}
