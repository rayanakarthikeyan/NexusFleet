import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, TelemetryPoint } from '@prisma/client';
import { Principal } from '../auth';
import { PrismaService } from '../prisma.service';
import { LocationDto } from './telemetry.dto';
export const frame = (p: TelemetryPoint) => ({
  ...p,
  timestamp: p.timestamp.getTime(),
  receivedAt: p.receivedAt.toISOString(),
});
@Injectable()
export class TelemetryService {
  constructor(private readonly db: PrismaService) {}
  async ingest(points: LocationDto[], actor: Principal) {
    if (!points.length || points.length > 500) throw new BadRequestException('Send 1–500 points');
    if (actor.role !== 'driver' || points.some((p) => p.tripId !== actor.tripId))
      throw new ForbiddenException();
    if (new Set(points.map((p) => p.clientPointId)).size !== points.length)
      throw new BadRequestException('Duplicate IDs in batch');
    return this.db.$transaction(
      async (tx) => {
        // The row lock serializes commits per trip. A consumer cursor cannot skip
        // a lower sequence that was allocated by a still-uncommitted transaction.
        const locked = await tx.$queryRaw<{ driverId: string }[]>`
        SELECT "driverId" FROM "Trip" WHERE "id" = ${actor.tripId}::uuid FOR UPDATE`;
        if (locked[0]?.driverId !== actor.sub)
          throw new ForbiddenException('Trip is not assigned to this driver');
        const old = await tx.telemetryPoint.findMany({
          where: {
            tripId: actor.tripId,
            clientPointId: { in: points.map((p) => p.clientPointId) },
          },
        });
        const existing = new Map(old.map((p) => [p.clientPointId, p]));
        for (const p of points) {
          const saved = existing.get(p.clientPointId);
          if (
            saved &&
            (saved.latitude !== p.latitude ||
              saved.longitude !== p.longitude ||
              saved.timestamp.getTime() !== p.timestamp ||
              saved.heading !== (p.heading ?? null) ||
              saved.speed !== (p.speed ?? null))
          )
            throw new ConflictException('ID reused for a different coordinate');
        }
        const fresh = points
          .filter((p) => !existing.has(p.clientPointId))
          .sort(
            (a, b) => a.timestamp - b.timestamp || a.clientPointId.localeCompare(b.clientPointId),
          );
        if (fresh.length) {
          const trip = await tx.trip.update({
            where: { id: actor.tripId },
            data: { nextSequence: { increment: fresh.length } },
          });
          await tx.telemetryPoint.createMany({
            data: fresh.map((p, index) => ({
              ...p,
              heading: p.heading ?? null,
              speed: p.speed ?? null,
              timestamp: new Date(p.timestamp),
              sequence: trip.nextSequence - fresh.length + index + 1,
            })),
          });
          const saved = await tx.telemetryPoint.findMany({
            where: {
              tripId: actor.tripId,
              clientPointId: { in: fresh.map((p) => p.clientPointId) },
            },
            orderBy: { sequence: 'asc' },
          });
          // Broadcast intent and coordinates commit together. A server crash after
          // commit cannot silently erase the pending notification.
          await tx.telemetryOutbox.create({
            data: {
              tripId: actor.tripId,
              payload: { points: saved.map(frame) } as unknown as Prisma.InputJsonValue,
            },
          });
        }
        return { success: true as const, acceptedIds: points.map((p) => p.clientPointId) };
      },
      { timeout: 15000, maxWait: 10000 },
    );
  }
  async history(actor: Principal, after: number) {
    const points = await this.db.telemetryPoint.findMany({
      where: {
        tripId: actor.tripId,
        sequence: { gt: after },
      },
      orderBy: { sequence: 'asc' },
      take: 500,
    });
    return {
      points: points.map(frame),
      nextCursor: points.at(-1)?.sequence ?? after,
      hasMore: points.length === 500,
    };
  }
}
