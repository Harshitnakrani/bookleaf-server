import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { BooksService } from './books.service';

@UseGuards(JwtAuthGuard)
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  /**
   * My Books: Author gets their own published & in-production books
   */
  @Get()
  async getMyBooks(@CurrentUser('id') authorId: string) {
    return this.booksService.getAuthorBooks(authorId);
  }

  /**
   * Author Dashboard: Overall sales and royalty figures
   */
  @Get('summary')
  async getMyBooksSummary(@CurrentUser('id') authorId: string) {
    return this.booksService.getAuthorBooksSummary(authorId);
  }

  /**
   * Admin-only: View all books across all authors
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
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
  async getBookById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.booksService.getBookById(id, user.id, user.role);
  }
}
