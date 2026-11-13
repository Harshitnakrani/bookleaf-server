import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TicketCategory, TicketPriority } from '@prisma/client';

export class OverrideTicketDto {
  @ApiPropertyOptional({
    enum: TicketCategory,
    example: TicketCategory.ROYALTY_AND_PAYMENTS,
    description: 'Human operator override for AI classification category',
  })
  @IsOptional()
  @IsEnum(TicketCategory, {
    message:
      'Valid categories: ROYALTY_AND_PAYMENTS, ISBN_AND_METADATA_ISSUES, PRINTING_AND_QUALITY, DISTRIBUTION_AND_AVAILABILITY, BOOK_STATUS_AND_PRODUCTION_UPDATES, GENERAL_INQUIRY',
  })
  category?: TicketCategory;

  @ApiPropertyOptional({
    enum: TicketPriority,
    example: TicketPriority.HIGH,
    description: 'Human operator override for AI priority assessment',
  })
  @IsOptional()
  @IsEnum(TicketPriority, {
    message: 'Valid priorities: CRITICAL, HIGH, MEDIUM, LOW',
  })
  priority?: TicketPriority;
}
