import { Controller, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  /**
   * Server-Sent Events stream for near-real-time updates without WebSocket dependencies
   */
  @Sse('stream')
  stream(): Observable<{ data: string }> {
    return this.realtimeService.getEventStream().pipe(
      map((event) => ({
        data: JSON.stringify(event),
      })),
    );
  }
}
