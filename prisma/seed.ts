import { PrismaClient, Role, TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting BookLeaf database seed...');

  // 1. Load sample JSON data
  const sampleDataPath = path.resolve(__dirname, '../../bookleaf_sample_data.json');
  if (!fs.existsSync(sampleDataPath)) {
    throw new Error(`Sample data file not found at ${sampleDataPath}`);
  }

  const rawData = fs.readFileSync(sampleDataPath, 'utf-8');
  const sampleData = JSON.parse(rawData);

  const defaultHashedPassword = await bcrypt.hash('Password123!', 10);

  // 2. Seed Admin user
  const adminEmail = 'admin@bookleaf.pub';
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'BookLeaf Ops Admin',
      email: adminEmail,
      password: defaultHashedPassword,
      role: Role.ADMIN,
      phone: '+91-11-2345-6789',
      city: 'Delhi',
      isBankDetailsLinked: true,
    },
  });
  console.log(`✅ Admin user seeded: ${adminUser.email} (Password: Password123!)`);

  // 3. Seed Authors and their Books
  let authorCount = 0;
  let bookCount = 0;

  for (const authorData of sampleData.authors) {
    const hasPaidRoyalty = authorData.books.some(
      (b: any) => b.royalty_paid && b.royalty_paid > 0,
    );

    // Upsert Author
    const author = await prisma.user.upsert({
      where: { email: authorData.email.toLowerCase().trim() },
      update: {
        name: authorData.name,
        phone: authorData.phone,
        city: authorData.city,
        authorId: authorData.author_id,
        joinedDate: new Date(authorData.joined_date),
      },
      create: {
        authorId: authorData.author_id,
        name: authorData.name,
        email: authorData.email.toLowerCase().trim(),
        password: defaultHashedPassword,
        phone: authorData.phone,
        city: authorData.city,
        role: Role.AUTHOR,
        joinedDate: new Date(authorData.joined_date),
        isBankDetailsLinked: hasPaidRoyalty,
        bankAccountName: hasPaidRoyalty ? authorData.name : null,
        bankAccountNumber: hasPaidRoyalty ? `9100${authorCount + 1000}458` : null,
        bankIfscCode: hasPaidRoyalty ? 'HDFC0001234' : null,
      },
    });

    authorCount++;

    // Upsert Books for this Author
    for (const bookData of authorData.books) {
      await prisma.book.upsert({
        where: { bookId: bookData.book_id },
        update: {
          title: bookData.title,
          isbn: bookData.isbn,
          genre: bookData.genre,
          publicationDate: bookData.publication_date
            ? new Date(bookData.publication_date)
            : null,
          status: bookData.status,
          mrp: bookData.mrp !== null ? bookData.mrp : null,
          authorRoyaltyPerCopy:
            bookData.author_royalty_per_copy !== null
              ? bookData.author_royalty_per_copy
              : null,
          totalCopiesSold: bookData.total_copies_sold || 0,
          totalRoyaltyEarned: bookData.total_royalty_earned || 0,
          royaltyPaid: bookData.royalty_paid || 0,
          royaltyPending: bookData.royalty_pending || 0,
          lastRoyaltyPayoutDate: bookData.last_royalty_payout_date
            ? new Date(bookData.last_royalty_payout_date)
            : null,
          printPartner: bookData.print_partner,
          availableOn: bookData.available_on || [],
          authorId: author.id,
        },
        create: {
          bookId: bookData.book_id,
          title: bookData.title,
          isbn: bookData.isbn,
          genre: bookData.genre,
          publicationDate: bookData.publication_date
            ? new Date(bookData.publication_date)
            : null,
          status: bookData.status,
          mrp: bookData.mrp !== null ? bookData.mrp : null,
          authorRoyaltyPerCopy:
            bookData.author_royalty_per_copy !== null
              ? bookData.author_royalty_per_copy
              : null,
          totalCopiesSold: bookData.total_copies_sold || 0,
          totalRoyaltyEarned: bookData.total_royalty_earned || 0,
          royaltyPaid: bookData.royalty_paid || 0,
          royaltyPending: bookData.royalty_pending || 0,
          lastRoyaltyPayoutDate: bookData.last_royalty_payout_date
            ? new Date(bookData.last_royalty_payout_date)
            : null,
          printPartner: bookData.print_partner,
          availableOn: bookData.available_on || [],
          authorId: author.id,
        },
      });

      bookCount++;
    }
  }

  console.log(`✅ Seeded ${authorCount} authors and ${bookCount} books successfully.`);

  // 4. Seed Knowledge Base Articles
  const kbArticles = [
    {
      category: TicketCategory.ROYALTY_AND_PAYMENTS,
      title: 'Royalty Calculation & Payout Schedule',
      content:
        '80/20 net profit royalty split. Net profit = MRP minus printing, platform commission (Amazon/Flipkart), and shipping. Royalties calculated quarterly and paid within 45 days of quarter end. Minimum payout threshold is ₹1,000.',
      keywords: ['royalty', 'payments', 'payout', 'split', 'net profit', 'schedule'],
    },
    {
      category: TicketCategory.ISBN_AND_METADATA_ISSUES,
      title: 'ISBN Assignment & Imprint Policy',
      content:
        'Every book published receives a unique ISBN registered under BookLeaf publisher imprint. Authors needing personal imprint must obtain independently. Duplicate or incorrect ISBNs are high priority and escalated within 24-48 hours.',
      keywords: ['isbn', 'metadata', 'imprint', 'barcode', 'amazon sync'],
    },
    {
      category: TicketCategory.PRINTING_AND_QUALITY,
      title: 'Print Turnaround & Free Reprint Policy',
      content:
        'In-house printing in Delhi with Repro India and Epitome Books as overflow partners. Standard turnaround is 5-7 business days. Defective copies verified via photos qualify for free reprint within 5-7 days.',
      keywords: ['print', 'quality', 'defective', 'reprint', 'turnaround', 'binding'],
    },
    {
      category: TicketCategory.DISTRIBUTION_AND_AVAILABILITY,
      title: 'Online Retail Availability & Stock Sync',
      content:
        'Listed on Amazon India, Flipkart, Amazon US, UK, and BookLeaf Store. Listings go live within 7-10 business days. "Currently Unavailable" statuses indicate feed stock sync issues, resolved within 24-48 hours.',
      keywords: ['distribution', 'amazon', 'flipkart', 'unavailable', 'stock sync'],
    },
    {
      category: TicketCategory.BOOK_STATUS_AND_PRODUCTION_UPDATES,
      title: 'Book Production Milestones',
      content:
        'Production stages: Manuscript Received -> Editing -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live. Updates emailed at every stage.',
      keywords: ['status', 'typesetting', 'proofreading', 'cover design', 'production'],
    },
    {
      category: TicketCategory.GENERAL_INQUIRY,
      title: 'Author Profile & Metadata Updates',
      content:
        'Author biography or book description updates can be requested through dashboard or support email. Platform reflect times are typically 3-5 business days.',
      keywords: ['general', 'bio', 'description', 'support', 'account'],
    },
  ];

  for (const article of kbArticles) {
    const existing = await prisma.knowledgeBaseArticle.findFirst({
      where: { category: article.category },
    });
    if (!existing) {
      await prisma.knowledgeBaseArticle.create({ data: article });
    }
  }
  console.log(`✅ Seeded ${kbArticles.length} Knowledge Base policy articles.`);

  // 5. Seed Starter Support Tickets (Demonstrates initial queue with realistic cases)
  const priya = await prisma.user.findUnique({
    where: { email: 'priya.sharma@email.com' },
  });
  const whispersGanges = await prisma.book.findUnique({
    where: { bookId: 'BK001' },
  });

  if (priya && whispersGanges) {
    const existingTicket = await prisma.ticket.findFirst({
      where: { authorId: priya.id },
    });

    if (!existingTicket) {
      const ticket1 = await prisma.ticket.create({
        data: {
          ticketNumber: 'TICK-1001',
          authorId: priya.id,
          bookId: whispersGanges.id,
          subject: 'Query regarding pending royalty payment for Q3',
          description:
            'I noticed my dashboard shows ₹3,570 as pending royalty for Whispers of the Ganges. The last payout was on 2025-10-15. Could you please confirm when the remaining pending royalties will be disbursed to my account?',
          status: TicketStatus.OPEN,
          category: TicketCategory.ROYALTY_AND_PAYMENTS,
          aiCategory: TicketCategory.ROYALTY_AND_PAYMENTS,
          priority: TicketPriority.HIGH,
          aiPriority: TicketPriority.HIGH,
          aiReasoning:
            'Author inquiring about pending royalty payout exceeding threshold. Finance escalation recommended.',
          aiConfidence: 0.96,
        },
      });

      await prisma.ticketAuditLog.create({
        data: {
          ticketId: ticket1.id,
          userId: priya.id,
          action: 'TICKET_CREATED',
        },
      });

      console.log(`✅ Seeded sample ticket TICK-1001 for Priya Sharma`);
    }
  }

  const sneha = await prisma.user.findUnique({
    where: { email: 'sneha.kulkarni@email.com' },
  });
  const midnightMysore = await prisma.book.findUnique({
    where: { bookId: 'BK013' },
  });

  if (sneha && midnightMysore) {
    const existingTicket2 = await prisma.ticket.findFirst({
      where: { authorId: sneha.id, subject: { contains: 'Midnight in Mysore' } },
    });

    if (!existingTicket2) {
      const ticket2 = await prisma.ticket.create({
        data: {
          ticketNumber: 'TICK-1002',
          authorId: sneha.id,
          bookId: midnightMysore.id,
          subject: 'Production timeline for Midnight in Mysore cover design',
          description:
            'Hi BookLeaf team, my book Midnight in Mysore has been in Cover Design stage for the past 2 weeks. Could you provide an updated ETA on when I will receive the first set of concepts to review?',
          status: TicketStatus.OPEN,
          category: TicketCategory.BOOK_STATUS_AND_PRODUCTION_UPDATES,
          aiCategory: TicketCategory.BOOK_STATUS_AND_PRODUCTION_UPDATES,
          priority: TicketPriority.MEDIUM,
          aiPriority: TicketPriority.MEDIUM,
          aiReasoning:
            'Milestone timeline inquiry for book in active cover design phase.',
          aiConfidence: 0.94,
        },
      });

      await prisma.ticketAuditLog.create({
        data: {
          ticketId: ticket2.id,
          userId: sneha.id,
          action: 'TICKET_CREATED',
        },
      });

      console.log(`✅ Seeded sample ticket TICK-1002 for Sneha Kulkarni`);
    }
  }

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
