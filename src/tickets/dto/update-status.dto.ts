import { IsEnum, IsNotEmpty } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(TicketStatus, {
    message: 'Status must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED',
  })
  @IsNotEmpty()
  status: TicketStatus;
}
