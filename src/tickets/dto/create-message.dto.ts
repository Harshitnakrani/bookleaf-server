import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    example: 'I have linked my bank account now. Could you please verify?',
    description: 'Conversation reply text or internal investigation note',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  content: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Whether this message is an internal ops note (hidden from author)',
  })
  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean; // Visible only to Ops/Admins
}
