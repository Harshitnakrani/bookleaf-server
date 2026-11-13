import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health & System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'API Health Check', description: 'Returns system online greeting' })
  @ApiResponse({ status: 200, description: 'Service is operational' })
  getHello(): string {
    return this.appService.getHello();
  }
}
