import { IsOptional, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryNfAuditEventsDto {
  @ApiProperty({
    description: 'Filter by stage (RECEIVE, XML_PROCESS, BUSINESS_VALIDATE, PERSIST). Returns only events matching this stage.',
    required: false,
  })
  @IsString()
  @IsOptional()
  stage?: string;

  @ApiProperty({
    description: 'Filter by status (SUCCESS, ERROR, WARNING, DUPLICATE, REJECTED). Returns only events matching this status.',
    required: false,
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'Filter by source (API, EMAIL, S3, QIVE)', required: false })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({ description: 'Filter by chave de acesso (exact match)', required: false })
  @IsString()
  @IsOptional()
  chaveAcesso?: string;

  @ApiProperty({ description: 'Start date (ISO 8601) — returns events created at or after this timestamp', required: false })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiProperty({ description: 'End date (ISO 8601) — returns events created at or before this timestamp', required: false })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiProperty({ description: 'Page number', default: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({ description: 'Items per page', default: 50, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;
}
