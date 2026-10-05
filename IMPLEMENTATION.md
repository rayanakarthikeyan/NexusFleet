# NexusFleet complete implementation

This listing contains the complete source and configuration, file by file, with inline comments. See [README.md](README.md) for setup, protocol, interpolation math, verification, and operating limits. The runnable files are the source of truth; regenerate this listing with `node scripts/source-guide.mjs` after edits. The generated dependency lockfile is provided separately as `package-lock.json`.

## .dockerignore

```text
**/node_modules
**/.env
**/.env.*
**/dist
.git
.test-postgres
.test-postgres.log
mobile/android
mobile/ios
```

## .editorconfig

```text
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

## .env.example

```text
POSTGRES_PASSWORD=replace-with-a-local-password
```

## .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: nexus
          POSTGRES_PASSWORD: ci-only-password
          POSTGRES_DB: nexusfleet_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U nexus -d nexusfleet_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://nexus:ci-only-password@localhost:5432/nexusfleet_test
      DIRECT_URL: postgresql://nexus:ci-only-password@localhost:5432/nexusfleet_test
      TEST_DATABASE_URL: postgresql://nexus:ci-only-password@localhost:5432/nexusfleet_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run db:migrate --workspace backend
      - run: npm run check:mobile
      - run: npm test
      - name: Check generated source reference
        run: |
          npm run docs:source
          git diff --exit-code -- IMPLEMENTATION.md
```

## .gitignore

```text
node_modules/
dist/
.expo/
.env
.env.*
!.env.example
*.db
*.db-shm
*.db-wal
coverage/
.test-postgres/
.test-postgres.log
.verification/
mobile/android/
mobile/ios/
mobile/.eas/
```

## .prettierignore

```text
node_modules/
dist/
package-lock.json
IMPLEMENTATION.md
.verification/
.test-postgres/
mobile/android/
mobile/ios/
.expo/
*.prisma
```

## .prettierrc.json

```json
{
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "endOfLine": "lf"
}
```

## backend/.env.example

```text
DATABASE_URL=postgresql://nexus:replace-with-a-local-password@localhost:5432/nexusfleet?schema=public
# Use the same URL locally. On Neon, use its unpooled URL for migrations.
DIRECT_URL=postgresql://nexus:replace-with-a-local-password@localhost:5432/nexusfleet?schema=public
JWT_SECRET=replace-with-at-least-32-random-characters
PORT=3000
CORS_ORIGINS=https://your-viewer.example.com
# Demo operator only: passwords are required for seed:demo; never bundle them.
DEMO_DRIVER_EMAIL=driver@nexusfleet.example
DEMO_VIEWER_EMAIL=user@nexusfleet.example
DEMO_DRIVER_PASSWORD=
DEMO_VIEWER_PASSWORD=
# Optional existing trip UUID. Re-seeding otherwise preserves the account's trip.
DEMO_TRIP_ID=
```

## backend/Dockerfile

```text
# Build from the repository root: docker build -f backend/Dockerfile .
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY mobile/package.json mobile/package.json
RUN npm ci --workspace backend --ignore-scripts
COPY backend backend
RUN npm run build --workspace backend
RUN npm prune --omit=dev --workspace backend --ignore-scripts

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend ./backend
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/src/main.js"]
```

## backend/package.json

```json
{
  "name": "@nexusfleet/backend",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "build": "prisma generate && tsc -p tsconfig.json",
    "start": "node dist/src/main.js",
    "start:deploy": "node scripts/start-deploy.mjs",
    "dev": "tsc-watch -p tsconfig.json --onSuccess \"node dist/src/main.js\"",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "provision": "tsx scripts/provision-demo.ts",
    "seed:demo": "tsx scripts/seed-demo.ts",
    "test": "npm run build && tsx --test test/telemetry.integration.test.ts test/api.integration.test.ts test/accounts.integration.test.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.0",
    "@nestjs/core": "^11.1.0",
    "@nestjs/platform-express": "^11.1.0",
    "@nestjs/platform-socket.io": "^11.1.0",
    "@nestjs/websockets": "^11.1.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/throttler": "^6.4.0",
    "@prisma/client": "6.19.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.2",
    "dotenv": "^16.6.1",
    "helmet": "^8.1.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.3",
    "@types/node": "^22.0.0",
    "prisma": "6.19.0",
    "tsx": "^4.20.0",
    "typescript": "~5.9.2",
    "tsc-watch": "^7.2.0",
    "socket.io-client": "^4.8.1"
  }
}
```

## backend/prisma/migrations/20261004000000_initial/migration.sql

```sql
CREATE TABLE "Trip" (
  "id" UUID PRIMARY KEY, "driverId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextSequence" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "TelemetryPoint" (
  "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT,
  "clientPointId" UUID NOT NULL, "sequence" INTEGER NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "heading" DOUBLE PRECISION CHECK ("heading" >= 0 AND "heading" < 360),
  "speed" DOUBLE PRECISION CHECK ("speed" >= 0),
  "timestamp" TIMESTAMPTZ(3) NOT NULL, "isOfflineCache" BOOLEAN NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tripId", "clientPointId")
);
CREATE UNIQUE INDEX "TelemetryPoint_tripId_sequence_key" ON "TelemetryPoint"("tripId", "sequence");
CREATE INDEX "TelemetryPoint_tripId_timestamp_idx" ON "TelemetryPoint"("tripId", "timestamp");
CREATE TABLE "TelemetryOutbox" (
  "id" SERIAL PRIMARY KEY, "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT,
  "payload" JSONB NOT NULL, "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TelemetryOutbox_publishedAt_id_idx" ON "TelemetryOutbox"("publishedAt", "id");
```

## backend/prisma/migrations/20261005000000_demo_accounts/migration.sql

```sql
CREATE TABLE "DemoAccount" (
  "id" UUID PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('driver', 'consumer')),
  "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DemoAccount_email_key" ON "DemoAccount"("email");
CREATE INDEX "DemoAccount_tripId_idx" ON "DemoAccount"("tripId");
```

## backend/prisma/migrations/migration_lock.toml

```toml
provider = "postgresql"
```

## backend/prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Trip {
  id           String            @id @default(uuid()) @db.Uuid
  driverId     String
  createdAt    DateTime          @default(now())
  nextSequence Int               @default(0)
  points       TelemetryPoint[]
  outbox       TelemetryOutbox[]
  accounts     DemoAccount[]
}

model DemoAccount {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String
  role         String
  tripId       String   @db.Uuid
  disabled     Boolean  @default(false)
  createdAt    DateTime @default(now())
  trip         Trip     @relation(fields: [tripId], references: [id], onDelete: Restrict)

  @@index([tripId])
}

model TelemetryPoint {
  tripId         String   @db.Uuid
  clientPointId  String   @db.Uuid
  sequence       Int
  latitude       Float
  longitude      Float
  heading        Float?
  speed          Float?
  timestamp      DateTime @db.Timestamptz(3)
  isOfflineCache Boolean
  receivedAt     DateTime @default(now())
  trip           Trip     @relation(fields: [tripId], references: [id], onDelete: Restrict)

  // A lost ACK can retry forever without inserting a second coordinate.
  @@id([tripId, clientPointId])
  @@unique([tripId, sequence])
  @@index([tripId, timestamp])
}

model TelemetryOutbox {
  id          Int       @id @default(autoincrement())
  tripId      String    @db.Uuid
  payload     Json
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  trip        Trip      @relation(fields: [tripId], references: [id], onDelete: Restrict)

  @@index([publishedAt, id])
}
```

## backend/scripts/provision-demo.ts

```typescript
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
async function main() {
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) throw new Error('Configure JWT_SECRET first');
  const db = new PrismaClient();
  try {
    const index = process.argv.indexOf('--trip-id');
    const requestedTrip = index >= 0 ? process.argv[index + 1] : undefined;
    if (index >= 0 && !requestedTrip) throw new Error('--trip-id requires an existing trip UUID');
    const trip = requestedTrip
      ? await db.trip.findUniqueOrThrow({ where: { id: requestedTrip } })
      : await db.trip.create({ data: { driverId: randomUUID() } });
    const driverId = trip.driverId;
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const issue = (sub: string, role: string) =>
      jwt.sign(
        { sub, role, tripId: trip.id },
        {
          issuer: 'nexusfleet',
          audience: 'nexusfleet-mobile',
          expiresIn: '7d',
          algorithm: 'HS256',
        },
      );
    // Manual provisioning for the portfolio demo; credentials never ship in an APK.
    console.log(
      JSON.stringify(
        {
          tripId: trip.id,
          driverToken: issue(driverId, 'driver'),
          consumerToken: issue(randomUUID(), 'consumer'),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## backend/scripts/seed-demo.ts

```typescript
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/accounts/password';

async function main() {
  const driverEmail = (process.env.DEMO_DRIVER_EMAIL ?? 'driver@nexusfleet.example')
    .trim()
    .toLowerCase();
  const viewerEmail = (process.env.DEMO_VIEWER_EMAIL ?? 'user@nexusfleet.example')
    .trim()
    .toLowerCase();
  if (driverEmail === viewerEmail) throw new Error('Driver and Viewer need different emails');
  const driverPassword = process.env.DEMO_DRIVER_PASSWORD;
  const viewerPassword = process.env.DEMO_VIEWER_PASSWORD;
  if (!driverPassword || !viewerPassword)
    throw new Error('Set DEMO_DRIVER_PASSWORD and DEMO_VIEWER_PASSWORD in backend/.env');
  const [driverHash, viewerHash] = await Promise.all([
    hashPassword(driverPassword),
    hashPassword(viewerPassword),
  ]);
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.demoAccount.findUnique({ where: { email: driverEmail } });
      const requested = process.env.DEMO_TRIP_ID;
      if (existing && requested && existing.tripId !== requested)
        throw new Error('Existing demo account belongs to another trip; refusing to rebind it');
      const trip =
        existing || requested
          ? await tx.trip.findUniqueOrThrow({ where: { id: existing?.tripId ?? requested! } })
          : await tx.trip.create({ data: { driverId: randomUUID() } });
      if (existing && (existing.role !== 'driver' || existing.id !== trip.driverId))
        throw new Error('Existing driver email conflicts with trip ownership');
      const viewer = await tx.demoAccount.findUnique({ where: { email: viewerEmail } });
      if (viewer && (viewer.role !== 'consumer' || viewer.tripId !== trip.id))
        throw new Error('Existing viewer email belongs to another role or trip');
      // Re-running seed renews hashes on the same trip; queued locations keep their identity.
      await tx.demoAccount.upsert({
        where: { email: driverEmail },
        update: { passwordHash: driverHash, disabled: false },
        create: {
          id: trip.driverId,
          email: driverEmail,
          passwordHash: driverHash,
          role: 'driver',
          tripId: trip.id,
        },
      });
      await tx.demoAccount.upsert({
        where: { email: viewerEmail },
        update: { passwordHash: viewerHash, disabled: false },
        create: { email: viewerEmail, passwordHash: viewerHash, role: 'consumer', tripId: trip.id },
      });
      return { tripId: trip.id, driverEmail, viewerEmail };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Demo seed failed');
  process.exitCode = 1;
});
```

## backend/scripts/start-deploy.mjs

```javascript
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error('Configure DATABASE_URL and DIRECT_URL before starting a deployment');
}
if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}

// Never serve a newer binary against an older schema. Prisma uses an advisory
// lock to protect migration execution; only one gateway instance is supported.
execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: backendDirectory,
  stdio: 'inherit',
  timeout: 120_000,
});

await import('../dist/src/main.js');
```

## backend/src/accounts/accounts.controller.ts

```typescript
import {
  Body,
  Controller,
  Header,
  HttpCode,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { dummyPasswordHash, verifyPassword } from './password';

class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsIn(['driver', 'consumer'])
  role!: 'driver' | 'consumer';
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginDto) {
    const account = await this.db.demoAccount.findUnique({
      where: { email: input.email },
      include: { trip: true },
    });
    const valid = await verifyPassword(input.password, account?.passwordHash ?? dummyPasswordHash);
    if (
      !account ||
      !valid ||
      account.disabled ||
      account.role !== input.role ||
      (account.role === 'driver' && account.id !== account.trip.driverId)
    ) {
      // Never reveal whether an email exists or which role owns it.
      throw new UnauthorizedException('Email or password is incorrect for this role');
    }
    const expiresIn = 7 * 24 * 60 * 60;
    const accessToken = this.jwt.sign(
      { sub: account.id, role: account.role, tripId: account.tripId },
      {
        issuer: 'nexusfleet',
        audience: 'nexusfleet-mobile',
        algorithm: 'HS256',
        expiresIn,
      },
    );
    return { accessToken, expiresIn, tripId: account.tripId, role: input.role };
  }
}

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() input: LoginDto) {
    return this.accounts.login(input);
  }
}
```

## backend/src/accounts/password.ts

```typescript
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 32;
const cost = 32768;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Async scrypt keeps expensive password work off the HTTP event loop.
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128)
    throw new Error('Use a password of 12–128 characters');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, key, extra] = encoded.split('$');
  if (
    version !== 'scrypt-v1' ||
    !/^[0-9a-f]{32}$/.test(salt ?? '') ||
    !/^[0-9a-f]{64}$/.test(key ?? '') ||
    extra !== undefined
  )
    return false;
  const actual = await derive(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}

// Missing accounts perform the same password work to avoid an easy timing oracle.
export const dummyPasswordHash = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
```

## backend/src/app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { TelemetryController } from './telemetry/telemetry.controller';
import { TelemetryGateway } from './telemetry/telemetry.gateway';
import { TelemetryService } from './telemetry/telemetry.service';
import { HealthController } from './health.controller';
import { AccountsController, AccountsService } from './accounts/accounts.controller';
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 240 }]),
  ],
  controllers: [TelemetryController, HealthController, AccountsController],
  providers: [
    PrismaService,
    AuthService,
    AuthGuard,
    TelemetryService,
    TelemetryGateway,
    AccountsService,
  ],
})
export class AppModule {}
```

## backend/src/auth.ts

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
export interface Principal {
  sub: string;
  tripId: string;
  role: 'driver' | 'consumer';
  exp: number;
}
export type AuthRequest = Request & { principal: Principal };
export const jwtOptions = {
  issuer: 'nexusfleet',
  audience: 'nexusfleet-mobile',
  algorithms: ['HS256' as const],
};
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}
  async verify(token: string): Promise<Principal> {
    try {
      const claims = await this.jwt.verifyAsync<Principal>(token, jwtOptions);
      if (
        !claims.sub ||
        !/^[0-9a-f-]{36}$/i.test(claims.tripId) ||
        !['driver', 'consumer'].includes(claims.role) ||
        !Number.isFinite(claims.exp)
      )
        throw new Error();
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid or expired trip credential');
    }
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Bearer token required');
    req.principal = await this.auth.verify(match[1]);
    return true;
  }
}
```

## backend/src/health.controller.ts

```typescript
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Get()
  async readiness() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
```

## backend/src/main.ts

```typescript
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
async function main() {
  if ((process.env.JWT_SECRET?.length ?? 0) < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(json({ limit: '256kb' }));
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean) });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
void main().catch((error) => {
  console.error('Startup failed', error);
  process.exitCode = 1;
});
```

## backend/src/prisma.service.ts

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

## backend/src/telemetry/telemetry.controller.ts

```typescript
import {
  Body,
  Controller,
  Get,
  ParseArrayPipe,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard, AuthRequest } from '../auth';
import { TelemetryService } from './telemetry.service';
import { LocationDto } from './telemetry.dto';
import { ThrottlerGuard } from '@nestjs/throttler';
@Controller('telemetry')
@UseGuards(AuthGuard, ThrottlerGuard)
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}
  @Get('session')
  session(@Req() req: AuthRequest) {
    return { tripId: req.principal.tripId, role: req.principal.role };
  }
  @Post('burst-sync')
  burst(
    @Body(new ParseArrayPipe({ items: LocationDto, whitelist: true, forbidNonWhitelisted: true }))
    points: LocationDto[],
    @Req() req: AuthRequest,
  ) {
    return this.service.ingest(points, req.principal);
  }
  @Get('history')
  history(@Query('after') value = '0', @Req() req: AuthRequest) {
    const after = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(after) || after > 2147483647)
      throw new BadRequestException('Invalid cursor');
    return this.service.history(req.principal, after);
  }
}
```

## backend/src/telemetry/telemetry.dto.ts

```typescript
import { IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class LocationDto {
  @IsUUID('4') tripId!: string;
  @IsUUID('4') clientPointId!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90) latitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180) longitude!: number;
  // GPS reports -1 when speed or bearing is unavailable; the client sends null.
  @IsOptional() @IsNumber() @Min(0) @Max(359.999999999) heading!: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) speed!: number | null;
  @IsInt() @Min(0) @Max(8640000000000000) timestamp!: number;
  @IsBoolean() isOfflineCache!: boolean;
}
```

## backend/src/telemetry/telemetry.gateway.ts

```typescript
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
```

## backend/src/telemetry/telemetry.service.ts

```typescript
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
```

## backend/test/accounts.integration.test.ts

```typescript
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
```

## backend/test/api.integration.test.ts

```typescript
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
test(
  'Nest HTTP + Socket.IO: validation, room isolation, commit ACKs and history recovery',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    // Import the COMPILED module: esbuild/tsx does not emit Nest DI metadata.
    const { AppModule } = await import('../dist/src/app.module.js');
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const trip = await db.trip.create({ data: { driverId: randomUUID() } });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const issue = (sub: string, role: string) =>
      jwt.sign(
        { sub, tripId: trip.id, role },
        {
          issuer: 'nexusfleet',
          audience: 'nexusfleet-mobile',
          expiresIn: '5m',
          algorithm: 'HS256',
        },
      );
    const driverToken = issue(trip.driverId, 'driver');
    const consumerToken = issue(randomUUID(), 'consumer');
    const point = () => ({
      tripId: trip.id,
      clientPointId: randomUUID(),
      latitude: 12,
      longitude: 77,
      heading: 355,
      speed: 10,
      timestamp: Date.now(),
      isOfflineCache: false,
    });
    const post = (body: unknown, token?: string) =>
      fetch(`${url}/telemetry/burst-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    const consumer = io(url, {
      transports: ['websocket'],
      auth: { token: consumerToken },
      autoConnect: false,
    });
    const driver = io(url, {
      transports: ['websocket'],
      auth: { token: driverToken },
      autoConnect: false,
    });
    const connect = (socket: typeof consumer) =>
      new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
        socket.connect();
      });
    try {
      assert.equal((await post([point()])).status, 401);
      assert.equal((await post([point()], consumerToken)).status, 403);
      assert.equal((await post([{ ...point(), latitude: 91 }], driverToken)).status, 400);
      const first = point();
      const response = await post([first], driverToken);
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), {
        success: true,
        acceptedIds: [first.clientPointId],
      });
      await Promise.all([connect(consumer), connect(driver)]);
      assert.equal(
        (await consumer.timeout(5000).emitWithAck('subscribe_trip', { trip_id: randomUUID() }))
          .success,
        false,
      );
      assert.equal(
        (await consumer.timeout(5000).emitWithAck('subscribe_trip', { trip_id: trip.id })).success,
        true,
      );
      const live = point();
      const notification = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          consumer.off('location_frames', listener);
          reject(new Error('No broadcast'));
        }, 5000);
        const listener = (batch: { points: { clientPointId: string }[] }) => {
          if (batch.points.some((p) => p.clientPointId === live.clientPointId)) {
            clearTimeout(timer);
            consumer.off('location_frames', listener);
            resolve();
          }
        };
        consumer.on('location_frames', listener);
      });
      const ack = await driver.timeout(5000).emitWithAck('live_location', live);
      assert.deepEqual(ack, { success: true, acceptedIds: [live.clientPointId] });
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      await notification;
      assert.equal(
        (await consumer.timeout(5000).emitWithAck('live_location', point())).success,
        false,
      );
      assert.equal(
        (await driver.timeout(5000).emitWithAck('live_location', { ...point(), longitude: 999 }))
          .status,
        400,
      );
      await driver.timeout(5000).emitWithAck('live_location', live);
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      consumer.disconnect();
      await post([{ ...point(), isOfflineCache: true }], driverToken);
      const history = await fetch(`${url}/telemetry/history?after=2`, {
        headers: { Authorization: `Bearer ${consumerToken}` },
      });
      const page = (await history.json()) as {
        points: { sequence: number; isOfflineCache: boolean }[];
        nextCursor: number;
      };
      assert.equal(page.points.length, 1);
      assert.equal(page.points[0].isOfflineCache, true);
      assert.equal(page.nextCursor, 3);
    } finally {
      consumer.disconnect();
      driver.disconnect();
      await app.close();
      await db.telemetryOutbox.deleteMany({ where: { tripId: trip.id } });
      await db.telemetryPoint.deleteMany({ where: { tripId: trip.id } });
      await db.trip.delete({ where: { id: trip.id } });
      await db.$disconnect();
    }
  },
);
```

## backend/test/telemetry.integration.test.ts

```typescript
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
test(
  'PostgreSQL: concurrent retries, lost ACK, authorization, rollback and ordered history',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    // Explicit separate variable prevents accidentally running a suite against
    // a developer's DATABASE_URL or production telemetry database.
    const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const service = new TelemetryService(db as PrismaService);
    const trip = await db.trip.create({ data: { driverId: randomUUID() } });
    const actor: Principal = {
      sub: trip.driverId,
      tripId: trip.id,
      role: 'driver',
      exp: 9999999999,
    };
    const point = (timestamp: number): LocationDto => ({
      tripId: trip.id,
      clientPointId: randomUUID(),
      latitude: 12,
      longitude: 77,
      heading: null,
      speed: null,
      timestamp,
      isOfflineCache: true,
    });
    try {
      const a = point(Date.now()),
        b = point(Date.now() + 1000);
      const [first, retry] = await Promise.all([
        service.ingest([a], actor),
        service.ingest([a, b], actor),
      ]);
      assert.equal(first.success, true);
      assert.deepEqual(retry.acceptedIds, [a.clientPointId, b.clientPointId]);
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      assert.equal((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).nextSequence, 2);
      assert.equal((await service.history(actor, 0)).nextCursor, 2);
      assert.deepEqual(
        (await service.history(actor, 0)).points.map((p) => p.sequence),
        [1, 2],
      );
      assert.equal((await service.history(actor, 2)).points.length, 0);
      // A colliding ID aborts the ENTIRE batch, including otherwise-new points.
      await assert.rejects(
        service.ingest([{ ...a, latitude: 50 }, point(Date.now())], actor),
        /ID reused/,
      );
      assert.equal(await db.telemetryPoint.count({ where: { tripId: trip.id } }), 2);
      await assert.rejects(service.ingest([point(Date.now())], { ...actor, role: 'consumer' }));
      await assert.rejects(service.ingest([point(Date.now())], { ...actor, sub: randomUUID() }));
      const c = point(Date.now() + 2000),
        d = point(Date.now() + 3000);
      const previousOutboxCount = await db.telemetryOutbox.count({ where: { tripId: trip.id } });
      await Promise.all([service.ingest([c], actor), service.ingest([d], actor)]);
      assert.deepEqual(
        (await service.history(actor, 0)).points.map((p) => p.sequence),
        [1, 2, 3, 4],
      );
      assert.equal(
        await db.telemetryOutbox.count({ where: { tripId: trip.id } }),
        previousOutboxCount + 2,
      );
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
  },
);
```

## backend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts"]
}
```

## compose.yaml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in root .env}
      POSTGRES_DB: nexusfleet
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - fleet-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U nexus -d nexusfleet']
      interval: 5s
      timeout: 5s
      retries: 10
volumes:
  fleet-data:
```

## mobile/.env.example

```text
EXPO_PUBLIC_API_URL=https://your-api.example.com
# Optional public style override. No key is needed for the default OpenFreeMap style.
EXPO_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

## mobile/App.tsx

```tsx
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from './types';
import { getSetting, setSetting } from './services/LocalDatabase';
import { loadAccounts, signIn, signInWithPassword, signOut } from './services/AccountManager';
import type { TripRole, SignInInput } from './services/sessionPolicy';
import { startSyncManager } from './services/SyncManager';
import DriverScreen from './screens/DriverScreen';
import ConsumerMap from './screens/ConsumerMap';
import TripSignIn from './screens/TripSignIn';
import { colors } from './theme';

export default function App() {
  const [driver, setDriver] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<Session | null>(null);
  const [role, setRole] = useState<TripRole>('driver');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [driverRevision, setDriverRevision] = useState(0);
  const [viewerRevision, setViewerRevision] = useState(0);
  const session = role === 'driver' ? driver : viewer;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const accounts = await loadAccounts();
        const rememberedRole = await getSetting('active-role');
        if (!mounted) return;
        setDriver(accounts.driver);
        setViewer(accounts.viewer);
        setRole(
          rememberedRole === 'consumer' || (!accounts.driver && accounts.viewer)
            ? 'consumer'
            : 'driver',
        );
      } catch (error) {
        if (mounted) setFailure(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // The selected UI role never owns the background session. Viewer login,
    // navigation and credential editing leave driver delivery running.
    if (driver) return startSyncManager();
  }, [driver?.tripId, driverRevision]);

  function selectRole(next: TripRole) {
    setRole(next);
    setEditing(false);
    void setSetting('active-role', next).catch((error) => Alert.alert('NexusFleet', String(error)));
  }

  async function configure(input: SignInInput) {
    setBusy(true);
    try {
      const next =
        'code' in input
          ? await signIn(role, input.code)
          : await signInWithPassword(role, input.email, input.password);
      if (role === 'driver') {
        setDriver(next);
        setDriverRevision((value) => value + 1);
      } else {
        setViewer(next);
        setViewerRevision((value) => value + 1);
      }
      setEditing(false);
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function leaveRole() {
    setBusy(true);
    try {
      await signOut(role);
    } catch (error) {
      Alert.alert(
        'Sign-out needs attention',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      // Refresh even if SecureStore cleanup failed after unbinding an account.
      try {
        const accounts = await loadAccounts();
        setDriver(accounts.driver);
        setViewer(accounts.viewer);
      } catch (error) {
        Alert.alert('Account refresh failed', String(error));
      }
      setBusy(false);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>NexusFleet</Text>
            <Text style={styles.subtitle}>Every trip, connected.</Text>
          </View>
          {session && !editing && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              hitSlop={12}
              onPress={() => setEditing(true)}
            >
              <Text style={styles.link}>Trip access</Text>
            </Pressable>
          )}
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.description}>Opening saved accounts…</Text>
          </View>
        ) : failure ? (
          <View style={styles.loading}>
            <Text style={styles.error}>Couldn’t open local storage: {failure}</Text>
            <Text style={styles.description}>Close and reopen the app to retry.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabs}>
              {(['driver', 'consumer'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: role === value, disabled: busy }}
                  disabled={busy}
                  style={[styles.tab, role === value && styles.selectedTab]}
                  onPress={() => selectRole(value)}
                >
                  <Text style={[styles.tabText, role === value && styles.selectedTabText]}>
                    {value === 'driver' ? 'Driver' : 'Viewer'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!session || editing ? (
              <TripSignIn
                key={role}
                role={role}
                session={session}
                busy={busy}
                onSubmit={configure}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <View style={styles.accountRow}>
                  <Text style={styles.accountLabel}>
                    {role === 'driver' ? 'Driver' : 'Viewer'} · Trip {session.tripId.slice(0, 8)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    hitSlop={10}
                    onPress={() => {
                      void leaveRole();
                    }}
                  >
                    <Text style={styles.link}>{busy ? 'Working…' : 'Sign out'}</Text>
                  </Pressable>
                </View>
                {role === 'driver' ? (
                  <ScrollView>
                    <DriverScreen />
                  </ScrollView>
                ) : (
                  <ConsumerMap key={`${session.tripId}:${viewerRevision}`} session={session} />
                )}
              </>
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { fontSize: 22, fontWeight: '800', color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 12, color: colors.muted },
  loading: { flex: 1, padding: 24, gap: 20, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.brand, fontWeight: '600', fontSize: 13 },
  description: { fontSize: 14, lineHeight: 23, color: colors.muted },
  error: { color: colors.danger, lineHeight: 22 },
  tabs: {
    marginHorizontal: 24,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    flexDirection: 'row',
    backgroundColor: '#E5EBF3',
  },
  tab: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 9 },
  selectedTab: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  selectedTabText: { color: colors.ink },
  accountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  accountLabel: { fontSize: 12, color: colors.muted },
});
```

## mobile/app.config.js

```javascript
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-build-properties',
      {
        android: {
          // The phone profile omits emulator/32-bit binaries to reduce download
          // and installation space. Preview keeps all four architectures.
          buildArchs:
            process.env.NEXUSFLEET_ARM64_ONLY === '1'
              ? ['arm64-v8a']
              : ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'],
          // Compress native libraries in the APK; Android extracts them during
          // install. ELF page alignment is still checked on the downloaded APK.
          useLegacyPackaging: true,
        },
      },
    ],
  ],
});
```

## mobile/app.json

```json
{
  "expo": {
    "name": "NexusFleet",
    "slug": "nexusfleet",
    "version": "1.0.1",
    "orientation": "portrait",
    "scheme": "nexusfleet",
    "newArchEnabled": true,
    "android": {
      "package": "com.nexusfleet.app",
      "permissions": [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION"
      ]
    },
    "plugins": [
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true,
          "locationAlwaysAndWhenInUsePermission": "NexusFleet tracks your location during an active trip, including while the app is in the background."
        }
      ],
      "expo-task-manager",
      "expo-sqlite",
      "expo-secure-store",
      "@maplibre/maplibre-react-native"
    ],
    "extra": {
      "eas": {
        "projectId": "71fe53a2-02cc-4bb0-83d7-9b1d9be98374"
      }
    },
    "owner": "rayanakarthikeyan"
  }
}
```

## mobile/babel.config.js

```javascript
module.exports = function (api) {
  api.cache(true);
  // SDK 54's preset installs the Worklets plugin automatically.
  return { presets: ['babel-preset-expo'] };
};
```

## mobile/eas.json

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "node": "22.23.3",
      "distribution": "internal",
      "environment": "preview",
      "autoIncrement": true,
      "android": { "buildType": "apk" }
    },
    "phone": {
      "extends": "preview",
      "env": { "NEXUSFLEET_ARM64_ONLY": "1" }
    },
    "production": {
      "autoIncrement": true,
      "environment": "production",
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

## mobile/index.ts

```typescript
// Registration must happen at module scope, before React renders, so Android
// can invoke the task when it launches the JS runtime without any mounted UI.
import './services/LocationTask';
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
```

## mobile/package.json

```json
{
  "name": "@nexusfleet/mobile",
  "private": true,
  "version": "1.0.1",
  "main": "index.ts",
  "scripts": {
    "start": "expo start --dev-client",
    "typecheck": "tsc --noEmit",
    "test": "tsx --test test/reliability.test.ts test/build-config.test.mjs",
    "build:check": "node scripts/check-build-config.mjs",
    "eas-build-post-install": "node scripts/check-build-config.mjs"
  },
  "dependencies": {
    "@maplibre/maplibre-react-native": "11.4.1",
    "@react-native-community/netinfo": "11.4.1",
    "@types/geojson": "7946.0.16",
    "expo": "~54.0.0",
    "expo-build-properties": "~1.0.10",
    "expo-crypto": "~15.0.7",
    "expo-dev-client": "~6.0.0",
    "expo-location": "~19.0.7",
    "expo-secure-store": "~15.0.7",
    "expo-sqlite": "~16.0.8",
    "expo-task-manager": "~14.0.8",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-worklets": "0.5.1",
    "socket.io-client": "^4.8.1"
  },
  "devDependencies": {
    "@types/react": "~19.1.10",
    "tsx": "^4.20.0",
    "typescript": "~5.9.2"
  }
}
```

## mobile/screens/ConsumerMap.tsx

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  Map as FleetMap,
  Camera,
  CameraRef,
  Marker,
  MarkerProps,
  GeoJSONSource,
  Layer,
} from '@maplibre/maplibre-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { io } from 'socket.io-client';
import { LocationFrame, Session } from '../types';
import { api, backendUrl, credential } from '../services/Transport';
import {
  bearing,
  normalizeHeading,
  normalizeLongitude,
  shortestDelta,
} from '../services/interpolation';
import { colors } from '../theme';
const AnimatedMarker = Animated.createAnimatedComponent(Marker);
const origin = { latitude: 12.9716, longitude: 77.5946 };
interface HistoryPage {
  points: LocationFrame[];
  nextCursor: number;
  hasMore: boolean;
}
export default function ConsumerMap({ session }: { session: Session }) {
  const latitude = useSharedValue(origin.latitude);
  const longitude = useSharedValue(origin.longitude);
  const heading = useSharedValue(0);
  const completion = useSharedValue(0);
  const camera = useRef<CameraRef>(null);
  const firstFix = useRef<[number, number] | null>(null);
  const [visible, setVisible] = useState(false);
  const [path, setPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [status, setStatus] = useState('Connecting…');
  const animatedProps = useAnimatedProps<MarkerProps>(() => ({
    // MapLibre expects longitude first. Marker exposes getAnimatableRef for
    // Reanimated 4, so this prop reaches the Fabric view on the UI thread.
    lngLat: [normalizeLongitude(longitude.value), latitude.value],
  }));
  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${normalizeHeading(heading.value)}deg` }],
  }));
  const route = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: path.map((point) => [point.longitude, point.latitude]),
      },
    }),
    [path],
  );
  useEffect(() => {
    let stopped = false,
      initialized = false,
      playing = false,
      fetching = false;
    let cursor = 0,
      highestTimestamp = -1;
    let previous: LocationFrame | undefined;
    const pending = new Map<number, LocationFrame>();
    const playback: LocationFrame[] = [];
    let wake: (() => void) | undefined;
    let socket: ReturnType<typeof io> | undefined;
    let viewerToken: string | undefined;
    const displayedPath: { latitude: number; longitude: number; timestamp: number }[] = [];
    let pathDirty = false;
    function appendPath(p: LocationFrame) {
      displayedPath.push({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp });
      // Bound rendering memory; the complete path remains in PostgreSQL.
      if (displayedPath.length > 5000) displayedPath.shift();
      pathDirty = true;
    }
    function finished() {
      if (stopped) return;
      playing = false;
      if (!playback.length) setStatus(socket?.connected ? 'Live' : 'Waiting for connectivity');
      wake?.();
      wake = undefined;
      playNext();
    }
    function playNext() {
      if (stopped || playing) return;
      let point = playback.shift();
      // Late uploads still remain in history/path, but must not drag the live
      // vehicle backwards in time after a newer fix has already been shown.
      while (point && point.timestamp < highestTimestamp) {
        appendPath(point);
        point = playback.shift();
      }
      if (!point) {
        wake?.();
        wake = undefined;
        return;
      }
      const p = point;
      highestTimestamp = p.timestamp;
      appendPath(p);
      const targetHeading =
        p.heading ??
        (previous ? bearing(previous.latitude, previous.longitude, p.latitude, p.longitude) : null);
      if (!initialized) {
        initialized = true;
        latitude.value = p.latitude;
        longitude.value = p.longitude;
        heading.value = targetHeading ?? 0;
        setVisible(true);
        firstFix.current = [p.longitude, p.latitude];
        camera.current?.jumpTo({ center: firstFix.current, zoom: 16 });
      }
      const catchUp = playback.length > 0 || p.isOfflineCache;
      const duration = catchUp ? Math.max(30, Math.min(120, 2000 / (playback.length + 1))) : 1000;
      setStatus(catchUp ? `Catch-up · ${playback.length + 1} fixes` : 'Live');
      // withTiming yields v(t) = v0 + (v1-v0) * t/duration (linear easing).
      // Unwrap longitude/bearing first, so 179 -> -179 crosses 2°, not 358°.
      latitude.value = withTiming(p.latitude, { duration, easing: Easing.linear });
      longitude.value = withTiming(longitude.value + shortestDelta(longitude.value, p.longitude), {
        duration,
        easing: Easing.linear,
      });
      if (targetHeading !== null)
        heading.value = withTiming(heading.value + shortestDelta(heading.value, targetHeading), {
          duration,
          easing: Easing.linear,
        });
      previous = p;
      playing = true;
      // Completion comes from the UI animation clock, not a JS setTimeout that
      // could fire early/late while the JS thread is busy decoding a burst.
      completion.value = 0;
      completion.value = withTiming(1, { duration, easing: Easing.linear }, (done) => {
        if (done) scheduleOnRN(finished);
      });
    }
    function receive(points: LocationFrame[]) {
      if (stopped) return;
      for (const p of points)
        if (p.tripId === session.tripId && p.sequence > cursor) pending.set(p.sequence, p);
      // Delivery order can differ from commit order; never advance past a gap.
      while (pending.has(cursor + 1)) {
        const next = pending.get(cursor + 1)!;
        pending.delete(++cursor);
        playback.push(next);
      }
      playNext();
    }
    async function recover() {
      if (stopped || fetching) return;
      fetching = true;
      try {
        let more = true;
        while (more && !stopped) {
          // Apply backpressure to history reads while replay is catching up.
          if (playback.length >= 1000)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          if (stopped) return;
          if (!viewerToken) return;
          const page = await api<HistoryPage>(
            `/telemetry/history?after=${cursor}`,
            {},
            viewerToken,
          );
          if (stopped) return;
          receive(page.points);
          more = page.hasMore;
          if (!more && !page.points.length && !initialized)
            setStatus('Waiting for the first GPS fix');
        }
      } catch (error) {
        if (!stopped)
          setStatus(error instanceof Error ? error.message : 'History reconnect failed');
      } finally {
        fetching = false;
      }
    }
    const connect = async () => {
      try {
        const token = await credential(session);
        viewerToken = token;
        if (stopped) return;
        socket = io(backendUrl(), { transports: ['websocket'], auth: { token }, timeout: 5000 });
        socket.on('location_frames', (batch: { points: LocationFrame[] }) => {
          // Large sparse socket bursts can otherwise grow an unbounded map.
          // History recovery is authoritative and fills any omitted sequence.
          if (pending.size < 1000 && playback.length < 1000 && Array.isArray(batch?.points))
            receive(batch.points);
          void recover();
        });
        socket.on('connect', () => {
          socket!
            .timeout(5000)
            .emit(
              'subscribe_trip',
              { trip_id: session.tripId },
              (error: Error | null, ack: { success?: boolean }) => {
                if (stopped) return;
                if (error || !ack?.success)
                  setStatus('Trip subscription failed; recovering over HTTP');
                // Subscribe FIRST, then read history: overlap is deduplicated by
                // sequence, and the subscribe/history race cannot drop a frame.
                void recover();
              },
            );
        });
        socket.on('connect_error', () => {
          if (!stopped) setStatus('Reconnecting; recovering history');
        });
        socket.on('disconnect', () => {
          if (!stopped) setStatus('Reconnecting…');
        });
        void recover();
      } catch (error) {
        if (!stopped) setStatus(String(error));
      }
    };
    void connect();
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void recover();
    }, 5000);
    const draw = setInterval(() => {
      if (pathDirty && !stopped) {
        pathDirty = false;
        // An older delayed batch fills the historical line at its event time.
        setPath([...displayedPath].sort((a, b) => a.timestamp - b.timestamp));
      }
    }, 100);
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        socket?.connect();
        void recover();
      }
    });
    return () => {
      stopped = true;
      wake?.();
      socket?.disconnect();
      lifecycle.remove();
      clearInterval(poll);
      clearInterval(draw);
      cancelAnimation(latitude);
      cancelAnimation(longitude);
      cancelAnimation(heading);
      cancelAnimation(completion);
    };
  }, [session.tripId, latitude, longitude, heading, completion]);
  return (
    <View style={styles.container}>
      <FleetMap
        style={StyleSheet.absoluteFill}
        mapStyle={
          process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'
        }
        touchRotate={false}
        touchPitch={false}
        onDidFinishLoadingStyle={() => {
          if (firstFix.current) camera.current?.jumpTo({ center: firstFix.current, zoom: 16 });
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: [origin.longitude, origin.latitude], zoom: 12 }}
        />
        {path.length > 1 && (
          <GeoJSONSource id="trip-route" data={route}>
            <Layer
              id="trip-route-line"
              type="line"
              paint={{ 'line-color': colors.brand, 'line-width': 4 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}
        {visible && (
          <AnimatedMarker
            id="driver-position"
            lngLat={[origin.longitude, origin.latitude]}
            animatedProps={animatedProps}
            anchor="center"
          >
            <Animated.View
              accessibilityLabel="Driver location"
              style={[styles.marker, markerStyle]}
            >
              <View style={styles.arrow} />
            </Animated.View>
          </AnimatedMarker>
        )}
      </FleetMap>
      <View style={styles.badge}>
        <Text style={styles.label}>TRIP {session.tripId.slice(0, 8).toUpperCase()}</Text>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.detail}>
          {path.length.toLocaleString()} locations in the displayed route
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  badge: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    elevation: 4,
  },
  label: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: colors.muted },
  status: { fontSize: 18, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 12, color: colors.muted },
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    marginTop: -2,
  },
});
```

## mobile/screens/DriverScreen.tsx

```tsx
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { getQueueCount, getSession, getSetting, saveSession } from '../services/LocalDatabase';
import { LOCATION_TASK, startTracking, stopTracking } from '../services/LocationTask';
import { flushQueue, observeSync } from '../services/SyncManager';
import { colors } from '../theme';
export default function DriverScreen() {
  const [tracking, setTracking] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [session, count, started, captureError, syncError] = await Promise.all([
          getSession(),
          getQueueCount(),
          Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
          getSetting('capture-error'),
          getSetting('sync-error'),
        ]);
        if (mounted) {
          setSimulated(session?.simulateOffline ?? false);
          setQueued(count);
          setTracking(started);
          setError(captureError || syncError || null);
          setReady(true);
        }
      } catch (err) {
        if (mounted) setError(String(err));
      } finally {
        refreshing = false;
      }
    };
    const unobserve = observeSync((message) => {
      if (mounted) setError(message);
    });
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);
    const network = NetInfo.addEventListener((state) => {
      if (mounted)
        setConnected(
          state.isConnected === null
            ? null
            : state.isConnected && state.isInternetReachable !== false,
        );
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      unobserve();
      network();
    };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      Alert.alert('NexusFleet', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const offline = simulated || connected === false;
  const disabled = busy || !ready;
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.title}>Your trip</Text>
        <View style={[styles.pill, offline && styles.offlinePill]}>
          <View style={[styles.dot, offline && styles.offlineDot]} />
          <Text style={styles.pillText}>
            {simulated
              ? 'Simulated offline'
              : connected === null
                ? 'Connecting'
                : offline
                  ? 'Offline'
                  : 'Connected'}
          </Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={[styles.eyebrow, styles.onDarkMuted]}>SAVED ON THIS DEVICE</Text>
        <Text style={styles.count}>{queued.toLocaleString()}</Text>
        <Text style={[styles.cardTitle, styles.onDark]}>
          {queued === 1 ? 'location waiting to upload' : 'locations waiting to upload'}
        </Text>
        <Text style={[styles.description, styles.onDarkMuted]}>
          {offline
            ? 'Keep moving. Your route will upload when delivery resumes.'
            : queued
              ? 'Saved points are waiting for confirmation from the server.'
              : 'New locations are saved locally before delivery.'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.cardTitle}>{tracking ? 'Trip recording' : 'Ready to record'}</Text>
        <Text style={styles.description}>
          {tracking ? 'Background enabled' : 'Location paused'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.button, tracking && styles.stopButton, disabled && styles.disabled]}
        onPress={() => {
          void action(async () => {
            if (tracking) await stopTracking();
            else await startTracking();
            setTracking(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK));
          });
        }}
      >
        <Text style={[styles.buttonText, tracking && styles.stopText]}>
          {busy ? 'Working…' : tracking ? 'Stop trip' : 'Start trip'}
        </Text>
      </Pressable>
      <Text style={styles.description}>
        An active trip records location in the background. Choose “Allow all the time” when Android
        opens location settings.
      </Text>
      <View style={styles.demoCard}>
        <Text style={styles.eyebrow}>DEMO CONTROLS</Text>
        <Text style={styles.cardTitle}>Take the connection out of the equation.</Text>
        <Text style={styles.description}>
          Turn this on, move with the phone, then turn it off to watch saved locations catch up on
          the live map.
        </Text>
        <Pressable
          disabled={disabled}
          style={[styles.toggle, simulated && styles.toggleOn, disabled && styles.disabled]}
          accessibilityRole="switch"
          accessibilityState={{ checked: simulated, disabled }}
          onPress={() => {
            void action(async () => {
              const session = await getSession();
              if (session?.role !== 'driver') throw new Error('Connect to a driver trip first');
              const next = !session.simulateOffline;
              await saveSession({ ...session, simulateOffline: next });
              setSimulated(next);
              if (!next) await flushQueue();
            });
          }}
        >
          <Text style={[styles.toggleText, simulated && styles.toggleOnText]}>
            Simulate Network Drop
          </Text>
          <Text style={[styles.toggleText, simulated && styles.toggleOnText]}>
            {simulated ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Delivery needs attention</Text>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.description}>
            Upload failures keep saved locations in the queue. Capture errors may mean new locations
            could not be saved.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 24, gap: 20 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#E5F5ED',
  },
  offlinePill: { backgroundColor: colors.warningSoft },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.positive },
  offlineDot: { backgroundColor: colors.warning },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.ink, borderRadius: 20, padding: 24, gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700', color: colors.muted },
  count: { fontSize: 64, fontWeight: '700', color: colors.surface, fontVariant: ['tabular-nums'] },
  onDark: { color: colors.surface },
  onDarkMuted: { color: '#B9C7D9' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  description: { fontSize: 13, lineHeight: 21, color: colors.muted },
  button: { padding: 18, borderRadius: 12, backgroundColor: colors.brand },
  stopButton: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  buttonText: { color: 'white', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  stopText: { color: colors.ink },
  disabled: { opacity: 0.5 },
  demoCard: {
    padding: 20,
    borderRadius: 20,
    gap: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    padding: 17,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
  },
  toggleOn: { backgroundColor: colors.warningSoft },
  toggleText: { fontSize: 14, fontWeight: '700', color: colors.brand },
  toggleOnText: { color: colors.warning },
  errorCard: { gap: 10, padding: 18, borderRadius: 12, backgroundColor: '#FFF0ED' },
  errorTitle: { fontWeight: '700', color: colors.danger },
  error: { color: colors.danger, lineHeight: 21 },
});
```

## mobile/screens/TripSignIn.tsx

```tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '../types';
import type { TripRole, SignInInput } from '../services/sessionPolicy';
import { colors } from '../theme';

interface Props {
  role: TripRole;
  session: Session | null;
  busy: boolean;
  onSubmit: (input: SignInInput) => Promise<void>;
  onCancel: () => void;
}

export default function TripSignIn({ role, session, busy, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [useCode, setUseCode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const driver = role === 'driver';
  const label = driver ? 'Driver' : 'Viewer';
  const incomplete = useCode ? !code.trim() : !email.trim() || !password;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>{label.toUpperCase()} SIGN-IN</Text>
      <Text style={styles.title}>
        {driver
          ? 'Keep the route.\nEven without coverage.'
          : 'Follow the trip.\nWatch the route catch up.'}
      </Text>
      <Text style={styles.description}>
        {driver
          ? 'Record locations in the background and upload saved points when the connection returns.'
          : 'Watch committed locations on the map, including points uploaded after a network drop.'}
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>
          {label} {useCode ? 'trip access code' : 'account'}
        </Text>
        <Text style={styles.description}>
          {session
            ? `Renew access to trip ${session.tripId.slice(0, 8)} or connect another trip.`
            : useCode
              ? `Paste the ${label.toLowerCase()} code supplied for your demo trip.`
              : `Use the demo ${driver ? 'driver' : 'user'} email and password supplied to you.`}
        </Text>
        {useCode ? (
          <TextInput
            value={code}
            onChangeText={setCode}
            editable={!busy}
            placeholder={`Paste ${label.toLowerCase()} code`}
            placeholderTextColor={colors.muted}
            accessibilityLabel={`${label} trip access code`}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              placeholder="Email address"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${label} email`}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${label} password`}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              style={styles.input}
            />
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || incomplete }}
          disabled={busy || incomplete}
          style={[styles.primary, (busy || incomplete) && styles.disabled]}
          onPress={() => {
            void onSubmit(useCode ? { code } : { email, password });
          }}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryText}>Sign in as {label}</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setUseCode(!useCode);
            setPassword('');
            setCode('');
          }}
          style={styles.cancel}
        >
          <Text style={styles.link}>
            {useCode ? 'Use email and password' : 'Use a trip code instead'}
          </Text>
        </Pressable>
        {session && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.cancel}
            onPress={onCancel}
          >
            <Text style={styles.link}>Back to current {label.toLowerCase()} trip</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.footnote}>
        Driver and Viewer stay signed in separately. Switching roles keeps an active driver trip
        running. The demo server may take a minute to wake on your first sign-in.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 32, gap: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: colors.brand },
  title: { fontSize: 30, lineHeight: 39, fontWeight: '700', color: colors.ink },
  description: { fontSize: 14, lineHeight: 23, color: colors.muted },
  card: {
    padding: 20,
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: colors.ink,
  },
  primary: { backgroundColor: colors.brand, padding: 17, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  cancel: { alignItems: 'center', padding: 8 },
  link: { color: colors.brand, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 19, color: colors.muted },
});
```

## mobile/scripts/check-build-config.mjs

```javascript
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function validateApkConfiguration(environment, appConfig) {
  const errors = [];
  let apiUrl;
  try {
    apiUrl = new URL(environment.EXPO_PUBLIC_API_URL ?? '');
  } catch {
    /* Report one useful error below. */
  }
  if (
    !apiUrl ||
    apiUrl.protocol !== 'https:' ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.pathname !== '/' ||
    apiUrl.search ||
    apiUrl.hash ||
    apiUrl.hostname.endsWith('.example.com') ||
    apiUrl.hostname.endsWith('.example')
  ) {
    errors.push(
      'EXPO_PUBLIC_API_URL must be your deployed HTTPS API origin, without credentials, a path, or placeholder hostname.',
    );
  }
  const projectId = appConfig.extra?.eas?.projectId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId ?? '')) {
    errors.push('Initialize the real Expo project and configure extra.eas.projectId in app.json.');
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mobileDirectory = new URL('../', import.meta.url);
  const localEnv = fileURLToPath(new URL('.env', mobileDirectory));
  if (existsSync(localEnv)) process.loadEnvFile(localEnv);
  const appConfig = JSON.parse(readFileSync(new URL('app.json', mobileDirectory), 'utf8')).expo;
  const errors = validateApkConfiguration(process.env, appConfig);
  if (errors.length) {
    // Print names/instructions only. Keys and connection credentials never enter build logs.
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('APK configuration is complete. Backend availability still needs verification.');
  }
}
```

## mobile/services/AccountManager.ts

```typescript
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types';
import {
  getQueueCount,
  getSession,
  getViewerSession,
  initializeDatabase,
  saveSession,
  saveViewerSession,
  setSetting,
} from './LocalDatabase';
import { api, disconnectTransport, loginWithPassword } from './Transport';
import {
  deleteTripCredential,
  getSavedTripCredential,
  saveTripCredential,
} from './CredentialStore';
import { LOCATION_TASK } from './LocationTask';
import { SerialQueue } from './SerialQueue';
import { assertDriverReplacement, TripRole, verifiedSession } from './sessionPolicy';

const accountWrites = new SerialQueue();

export async function signInWithPassword(
  role: TripRole,
  email: string,
  password: string,
): Promise<Session> {
  if (!email.trim() || !password) throw new Error('Enter your email and password.');
  const token = await loginWithPassword(email, password, role);
  // Only the scoped token is stored. The password never enters SQLite/SecureStore.
  return signIn(role, token);
}

export async function loadAccounts() {
  await initializeDatabase();
  const legacy = await getSession();
  const legacyToken = await SecureStore.getItemAsync('trip-token');
  if (legacy && legacyToken) {
    // Upgrade the single-login release without discarding its queue or token.
    // Write the role/trip-bound credential before retiring the old key.
    if (!(await getSavedTripCredential(legacy))) await saveTripCredential(legacy, legacyToken);
    if (legacy.role === 'consumer') {
      await saveViewerSession(legacy);
      await setSetting('session', '');
    }
    await SecureStore.deleteItemAsync('trip-token');
  }
  const [driver, viewer] = await Promise.all([getSession(), getViewerSession()]);
  return { driver: driver?.role === 'driver' ? driver : null, viewer };
}

export function signIn(role: TripRole, accessCode: string): Promise<Session> {
  return accountWrites.run(async () => {
    const code = accessCode.trim();
    if (!code) throw new Error('Enter a trip access code');
    const next = verifiedSession(await api<unknown>('/telemetry/session', {}, code), role);
    const old = role === 'driver' ? await getSession() : await getViewerSession();
    if (role === 'driver') {
      assertDriverReplacement(
        old,
        next,
        await getQueueCount(),
        await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
      );
      next.simulateOffline = old?.tripId === next.tripId ? old.simulateOffline : false;
    }
    // A new trip uses a different SecureStore key. If the metadata write fails,
    // the previously bound trip still resolves to its own credential.
    await saveTripCredential(next, code);
    if (role === 'driver') {
      await saveSession(next);
      disconnectTransport();
    } else {
      await saveViewerSession(next);
    }
    return next;
  });
}

export function signOut(role: TripRole): Promise<void> {
  return accountWrites.run(async () => {
    const old = role === 'driver' ? await getSession() : await getViewerSession();
    if (role === 'driver') {
      assertDriverReplacement(
        old,
        null,
        await getQueueCount(),
        await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
      );
    }
    await setSetting(role === 'driver' ? 'session' : 'viewer-session', '');
    if (role === 'driver') disconnectTransport();
    if (old) await deleteTripCredential(old);
  });
}
```

## mobile/services/CredentialStore.ts

```typescript
import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types';
import { credentialKey } from './sessionPolicy';

export async function getTripCredential(session: Session): Promise<string> {
  const token = await getSavedTripCredential(session);
  if (!token)
    throw new Error(`Sign in as ${session.role === 'driver' ? 'Driver' : 'Viewer'} first`);
  return token;
}

export const getSavedTripCredential = (session: Session) =>
  SecureStore.getItemAsync(credentialKey(session));

export const saveTripCredential = (session: Session, token: string) =>
  SecureStore.setItemAsync(credentialKey(session), token);

export const deleteTripCredential = (session: Session) =>
  SecureStore.deleteItemAsync(credentialKey(session));
```

## mobile/services/LocalDatabase.ts

```typescript
import * as SQLite from 'expo-sqlite';
import { LocationPayload, Session } from '../types';
import { SerialQueue } from './SerialQueue';
const writes = new SerialQueue();
function locked<T>(operation: () => Promise<T>): Promise<T> {
  return writes.run(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        // A second headless runtime can briefly hold the native file lock.
        // Keep this operation at the head of our queue while retrying it.
        if (attempt >= 4 || !/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(String(error)))
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 50));
      }
    }
  });
}
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
interface Row extends Omit<LocationPayload, 'isOfflineCache'> {
  isOfflineCache: number;
}
export function initializeDatabase() {
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync('nexusfleet.db');
      try {
        // WAL tolerates readers while a writer commits; FULL avoids discarding
        // a just-acknowledged local write during a device power interruption.
        await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
          PRAGMA busy_timeout = 5000;
          CREATE TABLE IF NOT EXISTS QueuedLocations (
            clientPointId TEXT PRIMARY KEY NOT NULL, tripId TEXT NOT NULL,
            latitude REAL NOT NULL, longitude REAL NOT NULL,
            heading REAL, speed REAL, timestamp INTEGER NOT NULL,
            isOfflineCache INTEGER NOT NULL CHECK(isOfflineCache IN (0,1))
          );
          CREATE INDEX IF NOT EXISTS queue_order ON QueuedLocations(tripId,timestamp,clientPointId);
          CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
        return db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    })();
    void opening.catch(() => {
      opening = undefined;
    });
  }
  return opening;
}
// Serialize ALL queries on one connection. Unrelated async writes cannot leak
// into a transaction. BEGIN IMMEDIATE also locks competing native connections.
export function insertLocations(points: LocationPayload[]) {
  return locked(async () => {
    const db = await initializeDatabase();
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      for (const p of points)
        await db.runAsync(
          `INSERT OR IGNORE INTO QueuedLocations
        (clientPointId,tripId,latitude,longitude,heading,speed,timestamp,isOfflineCache)
        VALUES (?,?,?,?,?,?,?,?)`,
          p.clientPointId,
          p.tripId,
          p.latitude,
          p.longitude,
          p.heading,
          p.speed,
          p.timestamp,
          p.isOfflineCache ? 1 : 0,
        );
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  });
}
export const insertLocation = (data: LocationPayload) => insertLocations([data]);
export function getUnsyncedLocations(tripId: string, limit = 500): Promise<LocationPayload[]> {
  return locked(async () => {
    const db = await initializeDatabase();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM QueuedLocations WHERE tripId=? ORDER BY timestamp,clientPointId LIMIT ?',
      tripId,
      Math.max(1, Math.min(500, limit)),
    );
    return rows.map((p) => ({ ...p, isOfflineCache: Boolean(p.isOfflineCache) }));
  });
}
export function clearSyncedLocations(ids: string[]) {
  if (!ids.length) return Promise.resolve();
  if (ids.length > 500) return Promise.reject(new Error('Delete batch exceeds 500'));
  return locked(async () => {
    const db = await initializeDatabase();
    // Never DELETE the entire table: new fixes can arrive during an HTTP call.
    await db.runAsync(
      `DELETE FROM QueuedLocations WHERE clientPointId IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
  });
}
export function markDelayed(ids: string[]) {
  return locked(async () => {
    if (!ids.length) return;
    const db = await initializeDatabase();
    await db.runAsync(
      `UPDATE QueuedLocations SET isOfflineCache=1 WHERE clientPointId IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
  });
}
export function getQueueCount() {
  return locked(
    async () =>
      (
        await (
          await initializeDatabase()
        ).getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM QueuedLocations')
      )?.count ?? 0,
  );
}
export function setSetting(key: string, value: string) {
  return locked(async () => {
    await (
      await initializeDatabase()
    ).runAsync(
      'INSERT INTO Settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key,
      value,
    );
  });
}
export function getSetting(key: string) {
  return locked(
    async () =>
      (
        await (
          await initializeDatabase()
        ).getFirstAsync<{ value: string }>('SELECT value FROM Settings WHERE key=?', key)
      )?.value ?? null,
  );
}
export async function getSession(): Promise<Session | null> {
  const raw = await getSetting('session');
  return raw ? (JSON.parse(raw) as Session) : null;
}
export const saveSession = (session: Session) => setSetting('session', JSON.stringify(session));

export async function getViewerSession(): Promise<Session | null> {
  const raw = await getSetting('viewer-session');
  return raw ? (JSON.parse(raw) as Session) : null;
}

export const saveViewerSession = (session: Session) =>
  setSetting('viewer-session', JSON.stringify(session));
```

## mobile/services/LocationTask.ts

```typescript
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { getSession, getSetting, insertLocations, setSetting } from './LocalDatabase';
import { flushQueue } from './SyncManager';
export const LOCATION_TASK = 'nexusfleet-background-location-v1';
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    try {
      if (error) throw new Error(error.message);
      const session = await getSession();
      // Stopping tracking clears this flag only after the native service stops.
      if (
        !session ||
        session.role !== 'driver' ||
        (await getSetting('tracking')) !== '1' ||
        !data?.locations.length
      )
        return;
      const state = await NetInfo.fetch().catch(() => null);
      await insertLocations(
        data.locations.map((fix) => ({
          clientPointId: Crypto.randomUUID(),
          tripId: session.tripId,
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          heading:
            fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading % 360 : null,
          speed: fix.coords.speed != null && fix.coords.speed >= 0 ? fix.coords.speed : null,
          timestamp: Math.trunc(fix.timestamp),
          isOfflineCache:
            session.simulateOffline || !state?.isConnected || state.isInternetReachable === false,
        })),
      );
      // Persist first even online. No in-memory-only gap between capture and ACK.
      await setSetting('capture-error', '');
      if (!session.simulateOffline) await flushQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Background location failed';
      console.error('Location task failed:', message);
      await setSetting('capture-error', message).catch(() => undefined);
    }
  },
);
export async function startTracking() {
  const session = await getSession();
  if (!session || session.role !== 'driver') throw new Error('Configure a driver session first');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted')
    throw new Error('Precise foreground location permission is required');
  if (foreground.android?.accuracy === 'coarse')
    throw new Error('Enable precise location in Android app settings');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted')
    throw new Error('Choose “Allow all the time” in Android location settings');
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Enable device location services');
  await setSetting('tracking', '1');
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)))
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
        deferredUpdatesInterval: 1000,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: 'NexusFleet trip active',
          notificationBody: 'Location is saved on this device and synced when connected.',
          notificationColor: '#176BFA',
          killServiceOnDestroy: false,
        },
      });
  } catch (error) {
    await setSetting('tracking', '0');
    throw error;
  }
}
export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await setSetting('tracking', '0');
  await flushQueue();
}
```

## mobile/services/SerialQueue.ts

```typescript
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    // A failed insert must not poison the queue and block all future captures.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
```

## mobile/services/SyncManager.ts

```typescript
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import {
  getSession,
  getUnsyncedLocations,
  clearSyncedLocations,
  markDelayed,
  setSetting,
} from './LocalDatabase';
import { acceptedIds, api, disconnectTransport, sendLive } from './Transport';
let flushing: Promise<void> | undefined;
let requested = false;
let failures = 0;
const listeners = new Set<(error: string | null) => void>();
export const observeSync = (fn: (error: string | null) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function flushQueue(): Promise<void> {
  requested = true;
  if (flushing) return flushing;
  flushing = drain().finally(() => {
    flushing = undefined;
  });
  return flushing;
}
async function drain() {
  // Bound headless task execution. Remaining durable rows are retried on the
  // next GPS callback, reconnect, app activation, or foreground retry timer.
  const deadline = Date.now() + 20000;
  try {
    do {
      requested = false;
      const session = await getSession();
      const state = await NetInfo.fetch();
      if (
        !session ||
        session.role !== 'driver' ||
        session.simulateOffline ||
        !state.isConnected ||
        state.isInternetReachable === false
      )
        return;
      let points = await getUnsyncedLocations(session.tripId);
      if (!points.length) return;
      let acknowledgement: unknown;
      if (points.length === 1 && !points[0].isOfflineCache) {
        try {
          acknowledgement = await sendLive(points[0]);
          acceptedIds(acknowledgement, points);
        } catch {
          // The server may already have committed the timed-out frame. Retry
          // over REST with the SAME ID instead of generating a second point.
          await markDelayed(points.map((p) => p.clientPointId));
          points = points.map((p) => ({ ...p, isOfflineCache: true }));
        }
      } else {
        await markDelayed(points.map((p) => p.clientPointId));
        points = points.map((p) => ({ ...p, isOfflineCache: true }));
      }
      if (!acknowledgement || points.some((p) => p.isOfflineCache)) {
        // Check the durable demo flag again before fallback network I/O.
        if ((await getSession())?.simulateOffline) return;
        acknowledgement = await api('/telemetry/burst-sync', {
          method: 'POST',
          body: JSON.stringify(points),
        });
      }
      await clearSyncedLocations(acceptedIds(acknowledgement, points));
      failures = 0;
      await setSetting('sync-error', '');
      listeners.forEach((fn) => fn(null));
      requested = true;
    } while (requested && Date.now() < deadline);
  } catch (error) {
    failures++;
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.warn('Sync retained local data:', message);
    await setSetting('sync-error', message).catch(() => undefined);
    listeners.forEach((fn) => fn(message));
  } finally {
    if (AppState.currentState !== 'active') disconnectTransport();
  }
}
export function startSyncManager() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const trigger = () => {
    void flushQueue();
  };
  const network = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) trigger();
  });
  const lifecycle = AppState.addEventListener('change', (state) => {
    if (state === 'active') trigger();
  });
  const retry = async () => {
    await flushQueue();
    if (!stopped)
      timer = setTimeout(
        () => {
          void retry();
        },
        Math.min(60000, 5000 * 2 ** Math.min(failures, 4)) + Math.random() * 1000,
      );
  };
  void retry();
  return () => {
    stopped = true;
    clearTimeout(timer);
    network();
    lifecycle.remove();
    disconnectTransport();
  };
}
```

## mobile/services/Transport.ts

```typescript
import { io, Socket } from 'socket.io-client';
import { LocationPayload, Session } from '../types';
import { getSession } from './LocalDatabase';
import { getTripCredential } from './CredentialStore';
export { acceptedIds } from './acknowledgement';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export function backendUrl() {
  if (!/^https:\/\//.test(API_URL) && !(__DEV__ && /^http:\/\//.test(API_URL))) {
    throw new Error('Set EXPO_PUBLIC_API_URL to an HTTPS backend URL');
  }
  return API_URL;
}
let socket: Socket | undefined;
let socketToken: string | undefined;
export async function credential(explicitSession?: Session) {
  // Background uploads always resolve the persisted DRIVER binding. A viewer
  // supplies its own session explicitly and can never replace this credential.
  const session = explicitSession ?? (await getSession());
  if (!session || (!explicitSession && session.role !== 'driver'))
    throw new Error('Sign in as Driver first');
  return getTripCredential(session);
}
export function disconnectTransport() {
  socket?.disconnect();
  socket = undefined;
  socketToken = undefined;
}
export async function driverSocket() {
  const token = await credential();
  if (!socket || socketToken !== token) {
    disconnectTransport();
    socketToken = token;
    socket = io(backendUrl(), {
      transports: ['websocket'],
      auth: { token },
      autoConnect: false,
      reconnection: false,
      timeout: 5000,
    });
  }
  const current = socket;
  if (current.connected) return current;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      current.off('connect', connected);
      current.off('connect_error', failed);
      clearTimeout(timer);
    };
    const connected = () => {
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => failed(new Error('Socket connect timed out')), 5500);
    current.once('connect', connected);
    current.once('connect_error', failed);
    current.connect();
  });
  return current;
}
export async function sendLive(point: LocationPayload): Promise<unknown> {
  const current = await driverSocket();
  return new Promise((resolve, reject) =>
    current
      .timeout(4000)
      .emit('live_location', point, (error: Error | null, ack: unknown) =>
        error ? reject(error) : resolve(ack),
      ),
  );
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<T> {
  const url = backendUrl();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(`${url}${path}`, {
      ...init,
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
        Authorization: `Bearer ${tokenOverride ?? (await credential())}`,
      },
    });
    if (!response.ok)
      throw new Error(
        `API returned ${response.status}${response.status === 401 ? ': renew the trip credential' : ''}`,
      );
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function loginWithPassword(
  email: string,
  password: string,
  role: Session['role'],
): Promise<string> {
  const abort = new AbortController();
  // A sleeping free demo server can take a minute to wake. This longer timeout
  // applies only to interactive sign-in; background uploads stay bounded.
  const timer = setTimeout(() => abort.abort(), 75000);
  try {
    const response = await fetch(`${backendUrl()}/auth/login`, {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, role }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Email or password is incorrect for this role.');
      if (response.status === 429)
        throw new Error('Too many sign-in attempts. Wait a minute and retry.');
      throw new Error(`Sign-in is unavailable (${response.status}). Try again shortly.`);
    }
    const result = (await response.json()) as { accessToken?: unknown };
    if (typeof result.accessToken !== 'string' || !result.accessToken)
      throw new Error('The server returned an invalid sign-in response.');
    return result.accessToken;
  } catch (error) {
    if (abort.signal.aborted)
      throw new Error('The demo server is taking longer to wake. Please retry.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
```

## mobile/services/acknowledgement.ts

```typescript
import { LocationPayload, SyncAck } from '../types';
export function acceptedIds(ack: unknown, sent: LocationPayload[]): string[] {
  const result = ack as Partial<SyncAck> | null;
  const ids = new Set(sent.map((p) => p.clientPointId));
  if (
    result?.success !== true ||
    !Array.isArray(result.acceptedIds) ||
    result.acceptedIds.length !== ids.size ||
    new Set(result.acceptedIds).size !== ids.size ||
    result.acceptedIds.some((id) => typeof id !== 'string' || !ids.has(id))
  ) {
    throw new Error('Invalid commit acknowledgement; retaining queue');
  }
  return result.acceptedIds;
}
```

## mobile/services/interpolation.ts

```typescript
export function shortestDelta(from: number, to: number): number {
  'worklet';
  // Positive modulo handles negative and accumulated/unwrapped angles.
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}
export function normalizeLongitude(value: number): number {
  'worklet';
  return ((((value + 180) % 360) + 360) % 360) - 180;
}
export function normalizeHeading(value: number): number {
  'worklet';
  return ((value % 360) + 360) % 360;
}
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number | null {
  const rad = Math.PI / 180;
  const a = lat1 * rad,
    b = lat2 * rad;
  const d = shortestDelta(lng1, lng2) * rad;
  const y = Math.sin(d) * Math.cos(b);
  const x = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d);
  return Math.abs(x) + Math.abs(y) < 1e-12 ? null : normalizeHeading(Math.atan2(y, x) / rad);
}
```

## mobile/services/sessionPolicy.ts

```typescript
import type { Session } from '../types';

export type TripRole = Session['role'];
export type SignInInput = { email: string; password: string } | { code: string };

export function credentialKey(session: Pick<Session, 'tripId' | 'role'>): string {
  return `nexusfleet.${session.role}.${session.tripId}`;
}

export function verifiedSession(value: unknown, expectedRole: TripRole): Session {
  const candidate = value as Partial<Session> | null;
  if (
    !candidate ||
    typeof candidate.tripId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate.tripId,
    ) ||
    candidate.role !== expectedRole
  ) {
    throw new Error(
      `Use a ${expectedRole === 'driver' ? 'Driver' : 'Viewer'} trip access code for this sign-in.`,
    );
  }
  return { tripId: candidate.tripId, role: expectedRole, simulateOffline: false };
}

export function assertDriverReplacement(
  current: Session | null,
  next: Session | null,
  queueCount: number,
  nativeTracking: boolean,
) {
  if (current?.tripId === next?.tripId && current && next) return;
  if (queueCount > 0 || nativeTracking) {
    throw new Error(
      'Stop the driver trip and upload saved locations before changing or signing out of the driver account. Viewer sign-in is still available.',
    );
  }
}
```

## mobile/test/build-config.test.mjs

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateApkConfiguration } from '../scripts/check-build-config.mjs';

const projectId = '1d00a589-8bf5-44e1-b158-f53fc5b5b063';
const environment = {
  EXPO_PUBLIC_API_URL: 'https://fleet-demo.onrender.com',
};

test('APK preflight rejects placeholders and accidental credentials in the API URL', () => {
  for (const url of [
    '',
    'http://fleet-demo.onrender.com',
    'https://your-api.example.com',
    'https://user:password@fleet-demo.onrender.com',
    'https://fleet-demo.onrender.com/telemetry',
  ]) {
    assert.ok(
      validateApkConfiguration(
        { ...environment, EXPO_PUBLIC_API_URL: url },
        { extra: { eas: { projectId } } },
      ).some((error) => error.startsWith('EXPO_PUBLIC_API_URL')),
    );
  }
  assert.equal(validateApkConfiguration({}, {}).length, 2);
});

test('APK preflight accepts a project binding from app.json without any Maps key', () => {
  assert.deepEqual(validateApkConfiguration(environment, { extra: { eas: { projectId } } }), []);
});
```

## mobile/test/reliability.test.ts

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SerialQueue } from '../services/SerialQueue';
import {
  bearing,
  normalizeHeading,
  normalizeLongitude,
  shortestDelta,
} from '../services/interpolation';
import { acceptedIds } from '../services/acknowledgement';
import { LocationPayload } from '../types';
import { credentialKey, verifiedSession, assertDriverReplacement } from '../services/sessionPolicy';

const tripA = '1d00a589-8bf5-44e1-b158-f53fc5b5b063';
const tripB = 'db7d63f8-df61-431b-9484-a26f49db31f0';

test('driver and viewer credentials remain isolated even on the same trip', () => {
  const driver = verifiedSession({ tripId: tripA, role: 'driver' }, 'driver');
  const viewer = verifiedSession({ tripId: tripA, role: 'consumer' }, 'consumer');
  assert.notEqual(credentialKey(driver), credentialKey(viewer));
  assert.notEqual(credentialKey(driver), credentialKey({ ...driver, tripId: tripB }));
  assert.throws(() => verifiedSession({ tripId: tripA, role: 'consumer' }, 'driver'), /Driver/);
  assert.throws(() => verifiedSession({ tripId: tripA, role: 'driver' }, 'consumer'), /Viewer/);
  assert.throws(() => verifiedSession({ tripId: 'invalid', role: 'driver' }, 'driver'));
});

test('a driver can renew while offline but cannot abandon a queue or active capture session', () => {
  const driver = verifiedSession({ tripId: tripA, role: 'driver' }, 'driver');
  const otherTrip = { ...driver, tripId: tripB };
  assert.doesNotThrow(() => assertDriverReplacement(driver, driver, 500, true));
  assert.throws(() => assertDriverReplacement(driver, otherTrip, 1, false), /upload saved/);
  assert.throws(() => assertDriverReplacement(driver, otherTrip, 0, true), /Stop the driver/);
  assert.throws(() => assertDriverReplacement(driver, null, 1, false));
  assert.throws(() => assertDriverReplacement(driver, null, 0, true));
  assert.throws(() => assertDriverReplacement(null, otherTrip, 1, false));
  assert.doesNotThrow(() => assertDriverReplacement(driver, otherTrip, 0, false));
  assert.doesNotThrow(() => assertDriverReplacement(driver, null, 0, false));
});
test('only an explicit commit acknowledgement for the exact batch permits deletion', () => {
  const sent = [{ clientPointId: 'a' }, { clientPointId: 'b' }] as LocationPayload[];
  assert.deepEqual(acceptedIds({ success: true, acceptedIds: ['b', 'a'] }, sent), ['b', 'a']);
  for (const ack of [
    undefined,
    null,
    { success: true },
    { success: false, acceptedIds: ['a', 'b'] },
    { success: true, acceptedIds: ['a'] },
    { success: true, acceptedIds: ['a', 'a'] },
    { success: true, acceptedIds: ['a', 'new-fix-arrived-during-upload'] },
  ]) {
    assert.throws(() => acceptedIds(ack, sent), /retaining queue/);
  }
});
test('concurrent work is serialized and a rejection does not poison subsequent writes', async () => {
  const queue = new SerialQueue(),
    events: string[] = [];
  const results = await Promise.allSettled([
    queue.run(async () => {
      events.push('first start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('first end');
    }),
    queue.run(async () => {
      events.push('failure');
      throw new Error('disk busy');
    }),
    queue.run(async () => {
      events.push('last');
      return 42;
    }),
  ]);
  assert.deepEqual(events, ['first start', 'first end', 'failure', 'last']);
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual(results[2], { status: 'fulfilled', value: 42 });
});
test('heading and longitude interpolate over the short arc', () => {
  assert.equal(shortestDelta(350, 10), 20);
  assert.equal(shortestDelta(10, 350), -20);
  assert.equal(shortestDelta(179, -179), 2);
  assert.equal(shortestDelta(-179, 179), -2);
  assert.equal(shortestDelta(1070, 10), 20);
  assert.equal(normalizeHeading(-10), 350);
  assert.equal(normalizeLongitude(181), -179);
});
test('missing GPS bearing uses geographic bearing and stationary fixes retain the last bearing', () => {
  assert.equal(bearing(0, 0, 0, 1), 90);
  assert.equal(bearing(0, 0, 1, 0), 0);
  assert.equal(bearing(12, 77, 12, 77), null);
  assert.equal(bearing(0, 179, 0, -179), 90);
});
```

## mobile/theme.ts

```typescript
export const colors = {
  background: '#F3F5F8',
  surface: '#FFFFFF',
  ink: '#172B4D',
  muted: '#63748B',
  border: '#DFE5ED',
  brand: '#285DE5',
  brandSoft: '#EAF0FF',
  positive: '#13795B',
  warning: '#9A5500',
  warningSoft: '#FFF3DF',
  danger: '#B42318',
};
```

## mobile/tsconfig.json

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "react-native": ["./node_modules/react-native", "../node_modules/react-native"] }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

## mobile/types.ts

```typescript
export interface LocationPayload {
  clientPointId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  isOfflineCache: boolean;
}
export interface LocationFrame extends LocationPayload {
  sequence: number;
  receivedAt: string;
}
export interface SyncAck {
  success: true;
  acceptedIds: string[];
}
export interface Session {
  tripId: string;
  role: 'driver' | 'consumer';
  simulateOffline: boolean;
}
```

## package.json

```json
{
  "name": "nexusfleet",
  "private": true,
  "version": "1.0.0",
  "workspaces": [
    "backend",
    "mobile"
  ],
  "scripts": {
    "build:backend": "npm run build -w backend",
    "check:mobile": "npm run typecheck -w mobile",
    "test": "npm test -w backend && npm test -w mobile",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "docs:source": "node scripts/source-guide.mjs"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "devDependencies": {
    "prettier": "3.6.2"
  },
  "description": "Offline-first Android fleet telemetry with durable capture and idempotent delivery."
}
```

## render.yaml

```yaml
# Keep the repository root as the build context: both workspaces share a lockfile.
services:
  - type: web
    name: nexusfleet-api
    runtime: node
    plan: free
    region: singapore
    buildCommand: npm ci --workspace backend --include=dev && npm run build:backend
    # Free services have no pre-deploy hook. Startup fails if a migration fails.
    startCommand: npm run start:deploy --workspace backend
    healthCheckPath: /health
    envVars:
      - key: NODE_VERSION
        value: '22'
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: DIRECT_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
    buildFilter:
      paths:
        - backend/**
        - package.json
        - package-lock.json
        - render.yaml
```

## scripts/source-guide.mjs

```javascript
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const paths = [
  'package.json',
  'compose.yaml',
  'render.yaml',
  '.prettierrc.json',
  '.editorconfig',
  '.prettierignore',
  '.env.example',
  '.gitignore',
  '.dockerignore',
];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      ['node_modules', 'dist', '.expo', 'android', 'ios'].includes(entry.name) ||
      (entry.name.startsWith('.env') && entry.name !== '.env.example')
    )
      continue;
    const path = join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) await visit(path);
    else if (
      ['.ts', '.tsx', '.json', '.js', '.mjs', '.prisma', '.sql', '.toml', '.yml', '.yaml'].includes(
        extname(path),
      ) ||
      ['Dockerfile', '.env.example'].includes(entry.name)
    )
      paths.push(path);
  }
}
await visit('backend');
await visit('mobile');
await visit('scripts');
await visit('.github');
paths.sort();
const language = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.json': 'json',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.prisma': 'prisma',
};
const blocks = await Promise.all(
  paths.map(
    async (path) =>
      `## ${path}\n\n\`\`\`${language[extname(path)] ?? 'text'}\n${(await readFile(path, 'utf8')).trimEnd()}\n\`\`\`\n`,
  ),
);
await writeFile(
  'IMPLEMENTATION.md',
  '# NexusFleet complete implementation\n\n' +
    'This listing contains the complete source and configuration, file by file, with inline comments. ' +
    'See [README.md](README.md) for setup, protocol, interpolation math, verification, and operating limits. ' +
    'The runnable files are the source of truth; regenerate this listing with `node scripts/source-guide.mjs` after edits. ' +
    'The generated dependency lockfile is provided separately as `package-lock.json`.\n\n' +
    blocks.join('\n'),
);
console.log(`Wrote IMPLEMENTATION.md with ${paths.length} complete files`);
```

## scripts/verify-pure.mjs

```javascript
// A small fallback runner for environments where native Expo packages cannot
// load in Node. These tests exercise platform-independent reliability logic.
import ts from 'typescript';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const sources = [
  'mobile/types.ts',
  'mobile/services/SerialQueue.ts',
  'mobile/services/interpolation.ts',
  'mobile/services/acknowledgement.ts',
  'mobile/services/sessionPolicy.ts',
  'mobile/test/reliability.test.ts',
];
for (const path of sources) {
  const output = `.verification/${path.replace(/\.ts$/, '.js')}`;
  await mkdir(dirname(output), { recursive: true });
  const compiled = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  await writeFile(output, compiled.outputText);
}
const result = spawnSync(
  process.execPath,
  ['--test', '.verification/mobile/test/reliability.test.js'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
```
