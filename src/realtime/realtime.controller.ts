import { Controller, Sse } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RealtimeService } from './realtime.service';

@ApiTags('Realtime Streams')
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  /**
   * Server-Sent Events stream for near-real-time updates without WebSocket dependencies
   */
  @Sse('stream')
  @ApiOperation({
    summary: 'SSE Real-Time Event Stream',
    description: 'Server-Sent Events connection streaming ticket status changes, AI classifications, and new messages in real-time',
  })
  @ApiResponse({ status: 200, description: 'Continuous event stream' })
  stream(): Observable<{ data: string }> {
    return this.realtimeService.getEventStream().pipe(
      map((event) => ({
        data: JSON.stringify(event),
      })),
    );
  }
}
