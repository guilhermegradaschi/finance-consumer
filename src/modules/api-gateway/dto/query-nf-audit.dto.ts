import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryNfAuditDto {
  @ApiProperty({
    description:
      'Include chaves where ANY processing log matches this stage (RECEIVE, XML_PROCESS, BUSINESS_VALIDATE, PERSIST). ' +
      'Filters across the full history, not just the latest event.',
    required: false,
  })
  @IsString()
  @IsOptional()
  stage?: string;

  @ApiProperty({
    description:
      'Include chaves where ANY processing log matches this status (SUCCESS, ERROR, WARNING, DUPLICATE, REJECTED). ' +
      'For example, status=DUPLICATE returns all chaves that have at least one DUPLICATE event, even if the latest event is different.',
    required: false,
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'Include chaves where ANY processing log matches this source (API, EMAIL, S3, QIVE)', required: false })
  @IsString()
  @IsOptional()
  source?: string;

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
