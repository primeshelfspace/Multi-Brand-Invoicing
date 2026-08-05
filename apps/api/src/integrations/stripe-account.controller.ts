import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  IntegrationError,
  idSchema,
  stripeCredentialsSchema,
  type Scope,
  type StripeCredentialsInput,
} from '@fenwick/shared';
import { zodPipe } from '../common/zod-validation.pipe.js';
import { CurrentScope, RequirePermission } from '../tenancy/authorisation.js';
import { StripeAccountService, type StripeAccountStatus } from './stripe-account.service.js';

/**
 * Brand-scoped Stripe credential management (multi-tenant Stripe). Every
 * route here is RLS- and permission-scoped exactly like the rest of the
 * admin API — nothing here is a special case for "this is a secret."
 */
@Controller('brands/:brandId/integrations/stripe')
export class StripeAccountController {
  constructor(private readonly stripeAccounts: StripeAccountService) {}

  @Get('status')
  @RequirePermission('INTEGRATIONS', 'READ')
  getStatus(
    @Param('brandId', zodPipe(idSchema)) brandId: string,
    @CurrentScope() scope: Scope,
  ): Promise<StripeAccountStatus> {
    return this.stripeAccounts.getStatus(scope, brandId);
  }

  @Put('credentials')
  @RequirePermission('INTEGRATIONS', 'WRITE')
  async saveCredentials(
    @Param('brandId', zodPipe(idSchema)) brandId: string,
    @Body(zodPipe(stripeCredentialsSchema)) body: StripeCredentialsInput,
    @CurrentScope() scope: Scope,
  ): Promise<StripeAccountStatus> {
    try {
      await this.stripeAccounts.saveCredentials(scope, brandId, body);
    } catch (cause) {
      throw this.mapIntegrationError(cause);
    }
    return this.stripeAccounts.getStatus(scope, brandId);
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermission('INTEGRATIONS', 'WRITE')
  async testConnection(
    @Param('brandId', zodPipe(idSchema)) brandId: string,
    @CurrentScope() scope: Scope,
  ): Promise<{ ok: true }> {
    try {
      await this.stripeAccounts.testStoredCredentials(scope, brandId);
    } catch (cause) {
      throw this.mapIntegrationError(cause);
    }
    return { ok: true };
  }

  /** A bad/unreachable key is the client's input failing validation against
   * a live provider, not this API misbehaving — 400, not a bare 500. */
  private mapIntegrationError(cause: unknown): Error {
    if (cause instanceof IntegrationError) {
      if (cause.errorClass === 'TRANSIENT') {
        return new BadGatewayException(cause.providerMessage ?? cause.message);
      }
      return new BadRequestException(cause.providerMessage ?? cause.message);
    }
    return cause instanceof Error ? cause : new Error(String(cause));
  }
}
