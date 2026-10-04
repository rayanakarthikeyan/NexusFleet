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
