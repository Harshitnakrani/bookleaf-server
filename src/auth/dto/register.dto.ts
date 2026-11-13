import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({
    example: 'Aarav Sharma',
    description: 'Full legal author name',
  })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiProperty({
    example: 'aarav.sharma@gmail.com',
    description: 'Unique email address for portal authentication',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'AuthorPass123!',
    description: 'Account password (minimum 6 characters)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiPropertyOptional({
    example: '+91 98765 43210',
    description: 'Contact phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Mumbai',
    description: 'Residential city/region',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'BL-AUTH-1001',
    description: 'Optional predefined BookLeaf Author ID',
  })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({
    enum: Role,
    default: Role.AUTHOR,
    description: 'User access role: AUTHOR or ADMIN',
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Role must be either AUTHOR, ADMIN, or SUPPORT_AGENT' })
  role?: Role;
}
