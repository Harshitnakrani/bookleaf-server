import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({
    example: 'Royalty disbursement inquiry for Q3 2026',
    description: 'Concise summary of the support query or operational issue',
  })
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @ApiProperty({
    example:
      'My sales dashboard displays 124 copies sold with ₹3,450 accrued, but funds have not reached my account.',
    description: 'Detailed explanation of the issue or question',
  })
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description: string;

  @ApiPropertyOptional({
    example: 'cm72f901a000108l4f14m9q31',
    description: 'Optional book ID if query concerns a specific published edition',
  })
  @IsOptional()
  @IsString()
  bookId?: string; // Optional: null for "General / Account Level" queries

  @ApiPropertyOptional({
    example: 'https://cdn.bookleaf.pub/proofs/bank_statement_snippet.pdf',
    description: 'URL of an uploaded screenshot or proof document',
  })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @ApiPropertyOptional({
    example: 'bank_statement_snippet.pdf',
    description: 'Original filename of the attachment',
  })
  @IsOptional()
  @IsString()
  attachmentName?: string;
}
