import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live() {
    return { status: 'alive' };
  }

  @Get('ready')
  ready() {
    return { status: 'ready' };
  }
}
