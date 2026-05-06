import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  private isAuthDisabled(): boolean {
    const v = this.configService.get<boolean | string | undefined>('AUTH_DISABLED');
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    return process.env.AUTH_DISABLED === 'true';
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.isAuthDisabled()) {
      const request = context.switchToHttp().getRequest<Request>();
      (request as Request & { user: unknown }).user = { sub: 'dev-user', role: 'admin' };
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'dev-secret');
      const payload = jwt.verify(token, secret);
      (request as Request & { user: unknown }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? (token ?? null) : null;
  }
}
