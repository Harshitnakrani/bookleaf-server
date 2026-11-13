import {
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeEvent, RealtimeService } from './realtime.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/events',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly realtimeService: RealtimeService) {}

  onModuleInit() {
    this.realtimeService.registerGatewayBroadcaster((event: RealtimeEvent) => {
      this.broadcastEvent(event);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ) {
    if (data?.room) {
      client.join(data.room);
      this.logger.log(`Client ${client.id} joined room: ${data.room}`);
      return { status: 'joined', room: data.room };
    }
  }

  @SubscribeMessage('leave:room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ) {
    if (data?.room) {
      client.leave(data.room);
      return { status: 'left', room: data.room };
    }
  }

  private broadcastEvent(event: RealtimeEvent) {
    if (!this.server) return;

    // Targeted ticket room broadcast
    if (event.ticketId) {
      this.server.to(`ticket:${event.ticketId}`).emit(event.event, event);
    }

    // Role-specific broadcast
    if (event.recipientRole === 'ADMIN') {
      this.server.to('role:ADMIN').emit(event.event, event);
    } else if (event.authorId) {
      this.server.to(`author:${event.authorId}`).emit(event.event, event);
    }

    // Broadcast to global feed
    this.server.emit(event.event, event);
  }
}
