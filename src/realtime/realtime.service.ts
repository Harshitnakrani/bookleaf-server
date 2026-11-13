import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface RealtimeEvent {
  event: string;
  data: any;
  recipientRole?: 'AUTHOR' | 'ADMIN' | 'ALL';
  authorId?: string;
  ticketId?: string;
  timestamp: string;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private eventSubject = new Subject<RealtimeEvent>();

  // WebSocket gateway reference (injected or registered dynamically)
  private wsBroadcaster: ((event: RealtimeEvent) => void) | null = null;

  registerGatewayBroadcaster(broadcaster: (event: RealtimeEvent) => void) {
    this.wsBroadcaster = broadcaster;
  }

  emit(event: Omit<RealtimeEvent, 'timestamp'>) {
    const payload: RealtimeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Emit to SSE stream
    this.eventSubject.next(payload);

    // Emit to WebSocket gateway if active
    if (this.wsBroadcaster) {
      try {
        this.wsBroadcaster(payload);
      } catch (err) {
        this.logger.warn(`Failed to broadcast WS event: ${(err as Error).message}`);
      }
    }
  }

  getEventStream(): Observable<RealtimeEvent> {
    return this.eventSubject.asObservable();
  }
}
