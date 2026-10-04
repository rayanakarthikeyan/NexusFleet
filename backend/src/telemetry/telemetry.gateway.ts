import { Logger, OnModuleDestroy, HttpException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { AuthService, Principal } from '../auth';
import { PrismaService } from '../prisma.service';
import { LocationDto } from './telemetry.dto';
import { TelemetryService } from './telemetry.service';
@WebSocketGateway({ maxHttpBufferSize: 256 * 1024, transports: ['websocket'] })
export class TelemetryGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(TelemetryGateway.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private readonly budgets = new Map<string, { start: number; count: number }>();
  constructor(
    private readonly auth: AuthService,
    private readonly service: TelemetryService,
    private readonly db: PrismaService,
  ) {}
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        socket.data.actor = await this.auth.verify(String(socket.handshake.auth.token ?? ''));
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
    server.on('connection', (socket) => {
      // Socket authentication is otherwise checked only on connection.
      const expiry = setTimeout(
        () => socket.disconnect(true),
        Math.max(0, socket.data.actor.exp * 1000 - Date.now()),
      );
      socket.on('disconnect', () => {
        clearTimeout(expiry);
        this.budgets.delete(socket.id);
      });
    });
    this.timer = setInterval(() => {
      void this.drain();
    }, 500);
  }
  private allow(socket: Socket) {
    const now = Date.now();
    const budget = this.budgets.get(socket.id) ?? { start: now, count: 0 };
    if (now - budget.start > 60000) {
      budget.start = now;
      budget.count = 0;
    }
    this.budgets.set(socket.id, budget);
    return ++budget.count <= 240;
  }
  @SubscribeMessage('subscribe_trip')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { trip_id?: string }) {
    const actor = socket.data.actor as Principal;
    if (!this.allow(socket) || actor.exp * 1000 <= Date.now() || body?.trip_id !== actor.tripId)
      return { success: false };
    await socket.join(`trip:${actor.tripId}`);
    return { success: true };
  }
  @SubscribeMessage('live_location')
  async live(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    const actor = socket.data.actor as Principal;
    if (!this.allow(socket) || actor.exp * 1000 <= Date.now())
      return { success: false, status: 429 };
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return { success: false, status: 400 };
      const dto = plainToInstance(LocationDto, body);
      if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length)
        return { success: false, status: 400 };
      // Socket ACK means durable database commit, never merely receipt.
      const ack = await this.service.ingest([dto], actor);
      void this.drain();
      return ack;
    } catch (error) {
      if (!(error instanceof HttpException)) this.logger.error('Location ingest failed', error);
      return { success: false, status: error instanceof HttpException ? error.getStatus() : 503 };
    }
  }
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      const rows = await this.db.telemetryOutbox.findMany({
        where: { publishedAt: null },
        orderBy: { id: 'asc' },
        take: 20,
      });
      for (const row of rows) {
        this.server.to(`trip:${row.tripId}`).emit('location_frames', row.payload);
        await this.db.telemetryOutbox.update({
          where: { id: row.id },
          data: { publishedAt: new Date() },
        });
      }
    } catch (error) {
      this.logger.error('Outbox retry scheduled', error);
    } finally {
      this.draining = false;
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
