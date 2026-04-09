import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NfSource } from '../../../common/enums/nf-source.enum';

/** Legacy JSON body shape; public API uses multipart file upload on POST /api/v1/nf. */
export class SubmitNfDto {
  @ApiProperty({ description: 'XML content of the NF-e' })
  @IsString()
  @IsNotEmpty()
  xmlContent!: string;

  @ApiPropertyOptional({ description: 'Source of the NF-e', enum: NfSource, default: NfSource.API })
  @IsEnum(NfSource)
  @IsOptional()
  source?: NfSource;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
