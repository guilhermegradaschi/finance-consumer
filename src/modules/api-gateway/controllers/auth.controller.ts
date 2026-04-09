import { Controller, Post, UseGuards, Req, Body, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { AuditLogService } from '../../../application/audit-log.service';
import { ExtractJwt } from 'passport-jwt';
import { IssueTokenDto } from '../dto/issue-token.dto';
import { IssueTokenResponseDto } from '../dto/issue-token-response.dto';

type JwtRequest = Request & { user?: { sub?: string } };

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private isTokenIssuerEnabled(): boolean {
    const v = this.configService.get<string>('AUTH_TOKEN_ISSUER_ENABLED')?.trim().toLowerCase();
    if (v === 'true' || v === '1') {
      return true;
    }
    if (v === 'false' || v === '0') {
      return false;
    }
    return this.configService.get<string>('NODE_ENV', 'development') !== 'production';
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({
    summary: 'Issue access token (JWT)',
    description:
      'Issues a Bearer JWT signed with `JWT_SECRET`. Disabled in production unless `AUTH_TOKEN_ISSUER_ENABLED=true`.',
  })
  @ApiBody({ type: IssueTokenDto })
  @ApiResponse({ status: 200, description: 'Token issued', type: IssueTokenResponseDto })
  @ApiResponse({ status: 403, description: 'Token issuance disabled' })
  async issueToken(@Body() dto: IssueTokenDto): Promise<IssueTokenResponseDto> {
    if (!this.isTokenIssuerEnabled()) {
      throw new ForbiddenException(
        'Token issuance is disabled. Set AUTH_TOKEN_ISSUER_ENABLED=true if you need this endpoint.',
      );
    }

    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const defaultTtl = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
    const expiresIn = dto.expiresIn?.trim() || defaultTtl;
    const sub = dto.sub?.trim() || 'api-client';

    const access_token = jwt.sign({ sub }, secret, { expiresIn });
    const decoded = jwt.decode(access_token) as { exp?: number } | null;
    const nowSec = Math.floor(Date.now() / 1000);
    const expires_in = decoded?.exp != null ? Math.max(0, decoded.exp - nowSec) : 0;

    this.auditLogService.log({ action: 'auth.token', userSub: sub });

    return { access_token, token_type: 'Bearer', expires_in };
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current JWT until expiry (logout)' })
  async revoke(@Req() req: JwtRequest) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      await this.tokenBlacklistService.revoke(token);
    }
    this.auditLogService.log({
      action: 'auth.revoke',
      userSub: req.user?.sub as string | undefined,
    });
    return { revoked: true };
  }
}
