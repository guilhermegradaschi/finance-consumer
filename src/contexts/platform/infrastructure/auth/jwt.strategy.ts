import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import type { Request } from 'express';
import { TokenBlacklistService } from '@context/platform/application/services/token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {
    const issuer = configService.get<string>('JWT_ISSUER', '')?.trim();
    const audience = configService.get<string>('JWT_AUDIENCE', '')?.trim();
    const opts: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      passReqToCallback: true,
    };
    if (issuer) opts.issuer = issuer;
    if (audience) opts.audience = audience;
    super(opts);
  }

  async validate(req: Request, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const raw = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (raw && (await this.tokenBlacklistService.isRevoked(raw))) {
      throw new UnauthorizedException('Token revoked');
    }
    return payload;
  }
}
