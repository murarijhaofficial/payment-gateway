import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): {
    readonly status: 'ok';
    readonly mode: 'sandbox-only';
    readonly payments: 'not-enabled';
  } {
    return { status: 'ok', mode: 'sandbox-only', payments: 'not-enabled' };
  }
}
