import { Body, Controller, Get, ParseArrayPipe, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
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
  burst(@Body(new ParseArrayPipe({ items: LocationDto, whitelist: true, forbidNonWhitelisted: true })) points: LocationDto[],
    @Req() req: AuthRequest) { return this.service.ingest(points, req.principal); }
  @Get('history')
  history(@Query('after') value = '0', @Req() req: AuthRequest) {
    const after = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(after) || after > 2147483647) throw new BadRequestException('Invalid cursor');
    return this.service.history(req.principal, after);
  }
}
