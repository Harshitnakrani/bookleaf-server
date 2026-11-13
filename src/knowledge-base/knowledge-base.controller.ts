import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TicketCategory } from '@prisma/client';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiTags('Knowledge Base & Policy Codex')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get()
  @ApiOperation({
    summary: 'Get Full Publishing Codex',
    description: 'Retrieves complete BookLeaf operational policies (royalty split, print timelines, reprint policies, distribution SLAs)',
  })
  @ApiResponse({ status: 200, description: 'All policy sections and company overview' })
  getAll() {
    return {
      companyOverview: this.kbService.companyOverview,
      sections: this.kbService.getAllSections(),
    };
  }

  @Get(':category')
  @ApiOperation({
    summary: 'Get Category Policy Slice',
    description: 'Retrieves domain-specific policy slice used by AI triage and autonomous resolution tools',
  })
  @ApiParam({
    name: 'category',
    enum: TicketCategory,
    description: 'Query category',
  })
  @ApiResponse({ status: 200, description: 'Knowledge slice for specified category' })
  getByCategory(@Param('category') category: TicketCategory) {
    return {
      slice: this.kbService.getKnowledgeSliceForCategory(category),
    };
  }
}
