import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { NfSource } from '@shared/enums/nf-source.enum';

export class IngestNfeProviderDto {
  @IsOptional()
  @IsString()
  xmlContent?: string;

  @IsOptional()
  @IsString()
  xml_base64?: string;

  @IsOptional()
  @IsString()
  access_key?: string;

  @IsOptional()
  @IsEnum(NfSource)
  source?: NfSource;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  correlation_id?: string;

  @IsOptional()
  @IsString()
  external_ref?: string;
}
