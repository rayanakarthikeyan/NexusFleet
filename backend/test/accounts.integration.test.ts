import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { hashPassword } from '../src/accounts/password';

test(
  'password login enforces role, disabled accounts, ownership and input limits',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    const { AppModule } = await import('../dist/src/app.module.js');
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const trip = await db.trip.create({ data: { driverId: randomUUID() } });
    const password = 'test-password-2026';
    const email = `${randomUUID()}@nexusfleet.example`;
    const viewerEmail = `${randomUUID()}@nexusfleet.example`;
    const hash = await hashPassword(password);
    assert.notEqual(hash, password);
    assert.notEqual(hash, await hashPassword(password), 'Passwords must have unique salts');
    await db.demoAccount.createMany({
      data: [
        { id: trip.driverId, email, passwordHash: hash, role: 'driver', tripId: trip.id },
        {
          id: randomUUID(),
          email: viewerEmail,
          passwordHash: hash,
          role: 'consumer',
          tripId: trip.id,
        },
      ],
    });
    const url = await app.getUrl();
    const login = (body: unknown) =>
      fetch(url + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    try {
      const result = await login({ email: ` ${email.toUpperCase()} `, password, role: 'driver' });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      const account = (await result.json()) as {
        accessToken: string;
        tripId: string;
        role: string;
      };
      assert.equal(account.tripId, trip.id);
      const claims = new JwtService({ secret: process.env.JWT_SECRET }).verify(
        account.accessToken,
        {
          issuer: 'nexusfleet',
          audience: 'nexusfleet-mobile',
          algorithms: ['HS256'],
        },
      );
      assert.equal(claims.sub, trip.driverId);
      assert.equal(claims.role, 'driver');
      assert.equal(
        (
          await fetch(url + '/telemetry/session', {
            headers: { Authorization: 'Bearer ' + account.accessToken },
          })
        ).status,
        200,
      );
      assert.equal((await login({ email: viewerEmail, password, role: 'consumer' })).status, 200);
      for (const body of [
        { email, password: 'wrong', role: 'driver' },
        { email, password, role: 'consumer' },
        { email: viewerEmail, password, role: 'driver' },
        { email: 'missing@nexusfleet.example', password, role: 'driver' },
      ])
        assert.equal((await login(body)).status, 401);
      assert.equal((await login({ email, password, role: 'admin' })).status, 400);
      assert.equal((await login({ email, password: 'x'.repeat(129), role: 'driver' })).status, 400);
      await db.demoAccount.update({ where: { email }, data: { disabled: true } });
      assert.equal((await login({ email, password, role: 'driver' })).status, 401);
      // A viewer cannot gain write access by having its stored role changed.
      await db.demoAccount.update({ where: { email: viewerEmail }, data: { role: 'driver' } });
      assert.equal((await login({ email: viewerEmail, password, role: 'driver' })).status, 401);
      // The next request exceeds this route's ten-attempt limit.
      assert.equal((await login({ email: viewerEmail, password, role: 'driver' })).status, 429);
    } finally {
      await app.close();
      await db.demoAccount.deleteMany({ where: { tripId: trip.id } });
      await db.trip.delete({ where: { id: trip.id } });
      await db.$disconnect();
    }
  },
);
