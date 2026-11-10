import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SandboxService } from './sandbox.service.js';

@Catch()
class SandboxErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const message =
      error instanceof HttpException
        ? error.message
        : 'Sandbox service unavailable. Check database setup and API server configuration.';
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({ statusCode: status, message });
  }
}
@Controller('v1/sandbox')
@UseFilters(SandboxErrors)
export class SandboxController {
  constructor(@Inject(SandboxService) private readonly service: SandboxService) {}
  @Post('auth/register') register(@Body() body: unknown, @Req() req: Request) {
    return this.service.register(body, req.ip ?? 'unknown');
  }
  @Post('auth/login') login(@Body() body: unknown, @Req() req: Request) {
    return this.service.login(body, req.ip ?? 'unknown');
  }
  @Post('auth/logout') async logout(@Headers('authorization') token: string | undefined) {
    return this.service.logout(await this.service.authenticate(token));
  }
  @Get('workspace') async workspace(@Headers('authorization') token: string | undefined) {
    return this.service.workspace(await this.service.authenticate(token));
  }
  @Get('payments') async payments(@Headers('authorization') token: string | undefined) {
    return this.service.transactions(await this.service.authenticate(token));
  }
  @Post('payments') async payment(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createPayment(await this.service.authenticate(token), key, body);
  }
  @Post('payments/:id/refund') async refund(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.refund(await this.service.authenticate(token), key, id, body);
  }
  @Post('settlements') async settle(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.settlement(await this.service.authenticate(token), key, body);
  }
  @Post('links') async link(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createLink(await this.service.authenticate(token), key, body);
  }
  @Post('links/:id/cancel') async cancelLink(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.cancelLink(await this.service.authenticate(token), key, id);
  }
  @Post('keys') async createKey(
    @Headers('authorization') token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.createKey(await this.service.authenticate(token), body);
  }
  @Delete('keys/:id') async revokeKey(
    @Headers('authorization') token: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.revokeKey(await this.service.authenticate(token), id);
  }
  @Post('fees/proposals') async propose(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.proposeFee(await this.service.authenticate(token), key, body);
  }
  @Post('fees/proposals/:id/approve') async approve(
    @Headers('authorization') token: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.approveFee(await this.service.authenticate(token), key, id);
  }
}
