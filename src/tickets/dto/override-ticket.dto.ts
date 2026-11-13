import { IsEnum, IsOptional } from 'class-validator';
import { TicketCategory, TicketPriority } from '@prisma/client';

export class OverrideTicketDto {
  @IsOptional()
  @IsEnum(TicketCategory, {
    message: 'Valid categories: ROYALTY_AND_PAYMENTS, ISBN_AND_METADATA_ISSUES, PRINTING_AND_QUALITY, DISTRIBUTION_AND_AVAILABILITY, BOOK_STATUS_AND_PRODUCTION_UPDATES, GENERAL_INQUIRY',
  })
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TicketPriority, {
    message: 'Valid priorities: CRITICAL, HIGH, MEDIUM, LOW',
  })
  priority?: TicketPriority;
}
