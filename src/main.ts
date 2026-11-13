import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Next.js frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global validation pipe for all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Set global prefix for clean REST API
  app.setGlobalPrefix('api');

  // OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BookLeaf Publishing — Operations & Author Support Portal API')
    .setDescription(
      `
# BookLeaf Publishing API Specification
Autonomous Author Support, AI-First Ticket Resolution, and Publishing Operations Platform.

## Core Capabilities:
- **Authentication**: Role-based JWT authentication for Authors and Ops Desk Administrators.
- **Support Tickets**: Auto-triage, category/priority classification, SLA tracking, and audit logging.
- **AI-First Autonomous Resolution**: Multi-turn ReAct agent loop investigating author royalties, catalog metadata, BookLeaf policies, and dispatching empathetic resolutions.
- **Catalog & Royalties**: Real-time sales reporting, ₹1,000 disbursement threshold audits, and bank account verification.
- **Real-Time WebSockets & SSE**: Low-latency reactive updates for ticket status changes and new messages.
      `.trim(),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your Bearer JWT token obtained from POST /api/auth/login',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'Author registration, login, and profile endpoints')
    .addTag(
      'Support Tickets & AI Resolution',
      'Author query submission, admin queue, audit trails, and ReAct AI resolution',
    )
    .addTag(
      'Author Books & Royalties',
      'Book catalog, production stages, sales performance, and royalty statements',
    )
    .addTag(
      'Knowledge Base & Policy Codex',
      'BookLeaf official policy codex slices for royalties, printing, and reprints',
    )
    .addTag('Realtime Streams', 'Server-Sent Events (SSE) and WebSocket stream endpoints')
    .addTag('Health & System', 'System diagnostics and service health verification')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'BookLeaf API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 BookLeaf Backend is running on: http://localhost:${port}/api`);
  console.log(`📚 Swagger OpenAPI Documentation available at: http://localhost:${port}/api/docs`);
}
bootstrap();
