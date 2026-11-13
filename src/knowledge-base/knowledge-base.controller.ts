import { Controller, Get, Param } from '@nestjs/common';
import { TicketCategory } from '@prisma/client';
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get()
  getAll() {
    return {
      companyOverview: this.kbService.companyOverview,
      sections: this.kbService.getAllSections(),
    };
  }

  @Get(':category')
  getByCategory(@Param('category') category: TicketCategory) {
    return {
      slice: this.kbService.getKnowledgeSliceForCategory(category),
    };
  }
}
