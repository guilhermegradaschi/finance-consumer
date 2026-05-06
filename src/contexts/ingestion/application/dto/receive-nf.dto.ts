import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { NfSource } from '@shared/enums/nf-source.enum';

export class ReceiveNfDto {
  @IsString()
  @IsNotEmpty()
  xmlContent!: string;

  @IsEnum(NfSource)
  @IsOptional()
  source?: NfSource = NfSource.API;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
