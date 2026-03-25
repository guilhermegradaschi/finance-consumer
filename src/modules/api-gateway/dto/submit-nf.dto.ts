import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NfSource } from '../../../common/enums/nf-source.enum';

export class SubmitNfDto {
  @ApiProperty({ description: 'XML content of the NF-e' })
  @IsString()
  @IsNotEmpty()
  xmlContent!: string;

  @ApiProperty({ description: 'Source of the NF-e', enum: NfSource, default: NfSource.API, required: false })
  @IsEnum(NfSource)
  @IsOptional()
  source?: NfSource;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
