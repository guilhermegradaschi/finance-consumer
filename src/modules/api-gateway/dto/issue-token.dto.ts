import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class IssueTokenDto {
  @ApiPropertyOptional({
    example: 'swagger-user',
    description: 'JWT subject (`sub`); used by rate limiting and audit',
  })
  @IsOptional()
  @IsString()
  sub?: string;

  @ApiPropertyOptional({
    example: '2h',
    description: 'Token lifetime (jsonwebtoken `expiresIn`, e.g. 60, "2h", "7d")',
  })
  @IsOptional()
  @IsString()
  expiresIn?: string;
}
