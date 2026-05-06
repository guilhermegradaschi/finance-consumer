import { ApiProperty } from '@nestjs/swagger';

export class NfSubmitResponseDto {
  @ApiProperty()
  chaveAcesso!: string;

  @ApiProperty()
  idempotencyKey!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  alreadyProcessed!: boolean;
}

export class NfListResponseDto {
  @ApiProperty({ type: [Object] })
  data!: Record<string, unknown>[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}
