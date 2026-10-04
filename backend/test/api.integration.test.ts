import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
test('Nest HTTP + Socket.IO: validation, room isolation, commit ACKs and history recovery',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    // Import the COMPILED module: esbuild/tsx does not emit Nest DI metadata.
    const { AppModule } = await import('../dist/src/app.module.js');
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const trip = await db.trip.create({ data: { driverId: randomUUID() } });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const issue = (sub: string, role: string) => jwt.sign({ sub, tripId: trip.id, role }, {
      issuer: 'nexusfleet', audience: 'nexusfleet-mobile', expiresIn: '5m', algorithm: 'HS256',
    });
    const driverToken = issue(trip.driverId, 'driver');
    const consumerToken = issue(randomUUID(), 'consumer');
    const point = () => ({ tripId: trip.id, clientPointId: randomUUID(), latitude: 12,
      longitude: 77, heading: 355, speed: 10, timestamp: Date.now(), isOfflineCache: false });
    const post = (body: unknown, token?: string) => fetch(`${url}/telemetry/burst-sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const consumer = io(url, { transports: ['websocket'], auth: { token: consumerToken }, autoConnect: false });
    const driver = io(url, { transports: ['websocket'], auth: { token: driverToken }, autoConnect: false });
    const connect = (socket: typeof consumer) => new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect();
    });
    try {
      assert.equal((await post([point()])).status, 401);
      assert.equal((await post([point()], consumerToken)).status, 403);
      assert.equal((await post([{ ...point(), latitude: 91 }], driverToken)).status, 400);
      const first = point();
      const response = await post([first], driverToken);
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { success: true, acceptedIds: [first.clientPointId] });
      await Promise.all([connect(consumer), connect(driver)]);
      assert.equal((await consumer.timeout(5000).emitWithAck('subscribe_trip', { trip_id: randomUUID() })).success, false);
      assert.equal((await consumer.timeout(5000).emitWithAck('subscribe_trip', { trip_id: trip.id })).success, true);
      const live = point();
      const notification = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { consumer.off('location_frames', listener); reject(new Error('No broadcast')); }, 5000);
        const listener = (batch: { points: { clientPointId: string }[] }) => {
          if (batch.points.some(p => p.clientPointId === live.clientPointId)) {
            clearTimeout(timer); consumer.off('location_frames', listener); resolve();
          }
        };
        consumer.on('location_frames', listener);
      });
      const ack = await driver.timeout(5000).emitWithAck('live_location', live);
      assert.deepEqual(ack, { success: true, acceptedIds: [live.clientPointId] });
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      await notification;
      assert.equal((await consumer.timeout(5000).emitWithAck('live_location', point())).success, false);
      assert.equal((await driver.timeout(5000).emitWithAck('live_location', { ...point(), longitude: 999 })).status, 400);
      await driver.timeout(5000).emitWithAck('live_location', live);
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      consumer.disconnect();
      await post([{ ...point(), isOfflineCache: true }], driverToken);
      const history = await fetch(`${url}/telemetry/history?after=2`, { headers: { Authorization: `Bearer ${consumerToken}` } });
      const page = await history.json() as { points: { sequence: number; isOfflineCache: boolean }[]; nextCursor: number };
      assert.equal(page.points.length, 1); assert.equal(page.points[0].isOfflineCache, true); assert.equal(page.nextCursor, 3);
    } finally {
      consumer.disconnect(); driver.disconnect(); await app.close();
      await db.telemetryOutbox.deleteMany({ where: { tripId: trip.id } });
      await db.telemetryPoint.deleteMany({ where: { tripId: trip.id } });
      await db.trip.delete({ where: { id: trip.id } }); await db.$disconnect();
    }
  });
