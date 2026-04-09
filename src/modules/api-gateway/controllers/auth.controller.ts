import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { AuditLogService } from '../../../application/audit-log.service';
import { ExtractJwt } from 'passport-jwt';

type JwtRequest = Request & { user?: { sub?: string } };

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
