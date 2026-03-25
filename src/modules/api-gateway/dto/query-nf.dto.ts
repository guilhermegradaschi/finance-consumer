import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { NfStatus } from '../../../common/enums/nf-status.enum';
import { NfSource } from '../../../common/enums/nf-source.enum';

export class QueryNfDto {
  @ApiProperty({ description: 'Filter by status', enum: NfStatus, required: false })
  @IsEnum(NfStatus)
  @IsOptional()
  status?: NfStatus;

  @ApiProperty({ description: 'Filter by source', enum: NfSource, required: false })
  @IsEnum(NfSource)
  @IsOptional()
  source?: NfSource;

  @ApiProperty({ description: 'Filter by emitente CNPJ', required: false })
  @IsString()
  @IsOptional()
  cnpjEmitente?: string;

  @ApiProperty({ description: 'Page number', default: 1, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({ description: 'Items per page', default: 20, required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
