import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { BooksService } from './books.service';

@ApiTags('Author Books & Royalties')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  /**
   * My Books: Author gets their own published & in-production books
   */
  @Get()
  @ApiOperation({
    summary: 'Get Author Books',
    description: 'Retrieves all books associated with the currently authenticated author, including all 10 metadata & royalty fields',
  })
  @ApiResponse({ status: 200, description: 'List of author books' })
  async getMyBooks(@CurrentUser('id') authorId: string) {
    return this.booksService.getAuthorBooks(authorId);
  }

  /**
   * Author Dashboard: Overall sales and royalty figures
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Get Author Royalties Summary',
    description: 'Calculates total copies sold, royalty earned, paid, pending, threshold status (₹1,000 floor), and bank link status',
  })
  @ApiResponse({ status: 200, description: 'Author financial and production summary' })
  async getMyBooksSummary(@CurrentUser('id') authorId: string) {
    return this.booksService.getAuthorBooksSummary(authorId);
  }

  /**
   * Admin-only: View all books across all authors
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  @ApiOperation({
    summary: 'List All Books (Admin)',
    description: 'Global catalog search across all authors with status filters and pagination',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search title or ISBN' })
  @ApiQuery({ name: 'status', required: false, description: 'Production status filter' })
  @ApiQuery({ name: 'authorId', required: false, description: 'Filter by specific author ID' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '20' })
  @ApiResponse({ status: 200, description: 'Paginated book catalog' })
  @ApiResponse({ status: 403, description: 'Forbidden: Requires ADMIN role' })
  async getAllBooksAdmin(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('authorId') authorId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.booksService.getAllBooksAdmin({
      search,
      status,
      authorId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * Single book details (Author ownership enforced or Admin access)
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get Single Book Details',
    description: 'Retrieves comprehensive metadata for a single book edition (enforces ownership or admin role)',
  })
  @ApiParam({ name: 'id', description: 'Book CUID or UUID' })
  @ApiResponse({ status: 200, description: 'Book details retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden: Book does not belong to author' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async getBookById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.booksService.getBookById(id, user.id, user.role);
  }
}
