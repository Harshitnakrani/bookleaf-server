import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all books for the authenticated author
   */
  async getAuthorBooks(authorId: string) {
    return this.prisma.book.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bookId: true,
        title: true,
        isbn: true,
        genre: true,
        publicationDate: true,
        status: true,
        mrp: true,
        authorRoyaltyPerCopy: true,
        totalCopiesSold: true,
        totalRoyaltyEarned: true,
        royaltyPaid: true,
        royaltyPending: true,
        lastRoyaltyPayoutDate: true,
        printPartner: true,
        availableOn: true,
        createdAt: true,
      },
    });
  }

  /**
   * Aggregate royalty & sales summary for author dashboard cards
   */
  async getAuthorBooksSummary(authorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        name: true,
        isBankDetailsLinked: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankIfscCode: true,
      },
    });

    const books = await this.prisma.book.findMany({
      where: { authorId },
    });

    const totalBooks = books.length;
    const publishedBooks = books.filter(
      (b) => b.status === 'Published & Live',
    ).length;
    const inProductionBooks = totalBooks - publishedBooks;

    const totalCopiesSold = books.reduce(
      (acc, b) => acc + (b.totalCopiesSold || 0),
      0,
    );
    const totalRoyaltyEarned = books.reduce(
      (acc, b) => acc + Number(b.totalRoyaltyEarned || 0),
      0,
    );
    const totalRoyaltyPaid = books.reduce(
      (acc, b) => acc + Number(b.royaltyPaid || 0),
      0,
    );
    const totalRoyaltyPending = books.reduce(
      (acc, b) => acc + Number(b.royaltyPending || 0),
      0,
    );

    return {
      author: user,
      totalBooks,
      publishedBooks,
      inProductionBooks,
      totalCopiesSold,
      totalRoyaltyEarned,
      totalRoyaltyPaid,
      totalRoyaltyPending,
      minimumPayoutThreshold: 1000,
      nextQuarterlyPayoutWindow: 'Within 45 days of quarter end',
    };
  }

  /**
   * Get single book by ID with RBAC check
   */
  async getBookById(id: string, requesterId: string, requesterRole: Role) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            authorId: true,
            name: true,
            email: true,
            phone: true,
            city: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book with ID "${id}" not found`);
    }

    // Role check: Authors can only view their own books
    if (requesterRole === Role.AUTHOR && book.authorId !== requesterId) {
      throw new ForbiddenException('You do not have access to this book');
    }

    return book;
  }

  /**
   * Admin-only: Get all books across all authors with search & filtering
   */
  async getAllBooksAdmin(params: {
    search?: string;
    status?: string;
    authorId?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, status, authorId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (authorId) {
      where.authorId = authorId;
    }

    if (status) {
      where.status = { contains: status, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { isbn: { contains: search, mode: 'insensitive' } },
        { bookId: { contains: search, mode: 'insensitive' } },
        { genre: { contains: search, mode: 'insensitive' } },
        { author: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, books] = await Promise.all([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              authorId: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      data: books,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
