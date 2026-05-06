import { ApiProperty } from '@nestjs/swagger';

export class IssueTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token!: string;

  @ApiProperty({ example: 'Bearer', enum: ['Bearer'] })
  token_type!: 'Bearer';

  @ApiProperty({ example: 3600, description: 'Seconds until the access token expires' })
  expires_in!: number;
}
