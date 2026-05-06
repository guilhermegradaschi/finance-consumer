import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { NfSource } from '@shared/enums/nf-source.enum';

export class SubmitNfMultipartFieldsDto {
  @ApiPropertyOptional({ enum: NfSource, default: NfSource.API })
  @IsOptional()
  @IsEnum(NfSource)
  source?: NfSource;

  @ApiPropertyOptional({
    description: 'Optional JSON object as string (merged into processing metadata)',
    example: '{"batchId":"b1"}',
  })
  @IsOptional()
  @IsString()
  metadataJson?: string;
}
