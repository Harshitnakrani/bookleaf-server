import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AssignTicketDto {
  @ApiPropertyOptional({
    example: 'cm72f901a000108l4f14m9q31',
    description: 'Internal User ID of the operations team member assigned to handle this ticket (or null to unassign)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  assignedToId?: string | null;
}
