import { IsOptional, IsString } from 'class-validator';

export class IngestNfeEventDto {
  @IsOptional()
  @IsString()
  xmlContent?: string;

  @IsOptional()
  @IsString()
  xml_base64?: string;

  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  @IsString()
  correlation_id?: string;
}
