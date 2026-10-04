import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
// Compile before this suite so Nest sees emitted constructor type metadata.
import { TelemetryService } from '../src/telemetry/telemetry.service';
import { PrismaService } from '../src/prisma.service';
import { Principal } from '../src/auth';
import { LocationDto } from '../src/telemetry/telemetry.dto';
test('PostgreSQL: concurrent retries, lost ACK, authorization, rollback and ordered history',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    // Explicit separate variable prevents accidentally running a suite against
    // a developer's DATABASE_URL or production telemetry database.
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const service = new TelemetryService(db as PrismaService);
    const trip = await db.trip.create({ data: { driverId: randomUUID() } });
    const actor: Principal = { sub: trip.driverId, tripId: trip.id, role: 'driver', exp: 9999999999 };
    const point = (timestamp: number): LocationDto => ({ tripId: trip.id, clientPointId: randomUUID(),
      latitude: 12, longitude: 77, heading: null, speed: null, timestamp, isOfflineCache: true });
    try {
      const a = point(Date.now()), b = point(Date.now() + 1000);
      const [first, retry] = await Promise.all([service.ingest([a], actor), service.ingest([a, b], actor)]);
      assert.equal(first.success, true); assert.deepEqual(retry.acceptedIds, [a.clientPointId, b.clientPointId]);
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).nextSequence, 2);
      assert.equal((await service.history(actor, 0)).nextCursor, 2);
      assert.deepEqual((await service.history(actor, 0)).points.map(p => p.sequence), [1, 2]);
      assert.equal((await service.history(actor, 2)).points.length, 0);
      // A colliding ID aborts the ENTIRE batch, including otherwise-new points.
      await assert.rejects(service.ingest([{ ...a, latitude: 50 }, point(Date.now())], actor), /ID reused/);
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      await assert.rejects(service.ingest([point(Date.now())], { ...actor, role: 'consumer' }));
      await assert.rejects(service.ingest([point(Date.now())], { ...actor, sub: randomUUID() }));
      const c = point(Date.now() + 2000), d = point(Date.now() + 3000);
      const previousOutboxCount = await db.telemetryOutbox.count({ where: { tripId: trip.id } });
      await Promise.all([service.ingest([c], actor), service.ingest([d], actor)]);
      assert.deepEqual((await service.history(actor, 0)).points.map(p => p.sequence), [1, 2, 3, 4]);
      assert.equal(await db.telemetryOutbox.count({ where: { tripId: trip.id } }), previousOutboxCount + 2);
      // Simulate commit followed by a lost HTTP response: retry acknowledges
      // the original ID without allocating a new sequence or notification.
      await service.ingest([d], actor);
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 4);
    } finally {
      await db.telemetryOutbox.deleteMany({ where: { tripId: trip.id } });
      await db.telemetryPoint.deleteMany({ where: { tripId: trip.id } });
      await db.trip.delete({ where: { id: trip.id } });
      await db.$disconnect();
    }
  });
