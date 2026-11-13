import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({
    enum: TicketStatus,
    example: TicketStatus.RESOLVED,
    description: 'Updated ticket status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)',
  })
  @IsEnum(TicketStatus, {
    message: 'Status must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED',
  })
  @IsNotEmpty()
  status: TicketStatus;
}
