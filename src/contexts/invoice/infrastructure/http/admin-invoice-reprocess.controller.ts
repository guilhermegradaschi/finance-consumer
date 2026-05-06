import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@context/platform/infrastructure/auth/jwt-auth.guard';
import { NfReprocessService } from '@context/nfe-legacy/application/services/nf-reprocess.service';

@ApiTags('Admin')
@Controller('admin/invoices')
export class AdminInvoiceReprocessController {
  constructor(private readonly nfReprocessService: NfReprocessService) {}

  @Post(':accessKey/reprocess')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reprocessar NF-e pela chave de acesso (alias admin)' })
  async reprocess(@Param('accessKey') accessKey: string) {
    return this.nfReprocessService.reprocessByAccessKey(accessKey);
  }
}
