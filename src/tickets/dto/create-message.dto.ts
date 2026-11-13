import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  content: string;

  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean; // Visible only to Ops/Admins
}
