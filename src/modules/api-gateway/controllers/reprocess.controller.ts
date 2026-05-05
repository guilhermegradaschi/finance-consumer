import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NfReprocessService } from '../services/nf-reprocess.service';

@ApiTags('Reprocessamento')
@Controller('api/v1/nf/reprocess')
export class ReprocessController {
  constructor(private readonly nfReprocessService: NfReprocessService) {}

  @Post(':chaveAcesso')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reprocess a NF-e by chave de acesso' })
  async reprocess(@Param('chaveAcesso') chaveAcesso: string) {
    return this.nfReprocessService.reprocessByAccessKey(chaveAcesso);
  }
}
