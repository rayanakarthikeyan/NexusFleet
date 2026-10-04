import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { TelemetryController } from './telemetry/telemetry.controller';
import { TelemetryGateway } from './telemetry/telemetry.gateway';
import { TelemetryService } from './telemetry/telemetry.service';
import { HealthController } from './health.controller';
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 240 }]),
  ],
  controllers: [TelemetryController, HealthController],
  providers: [PrismaService, AuthService, AuthGuard, TelemetryService, TelemetryGateway],
})
export class AppModule {}
