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
