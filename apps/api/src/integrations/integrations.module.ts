import { Module } from '@nestjs/common';
import { AccountingModule } from '../adapters/accounting/accounting.module.js';
import { IntegrationConnectionService } from './integration-connection.service.js';
import { StripeAccountController } from './stripe-account.controller.js';
import { StripeAccountService } from './stripe-account.service.js';
import { ZohoConnectController } from './zoho-connect.controller.js';
import { ZohoPullService } from './zoho-pull.service.js';
import { ZohoSyncService } from './zoho-sync.service.js';

@Module({
  imports: [AccountingModule],
  controllers: [ZohoConnectController, StripeAccountController],
  providers: [IntegrationConnectionService, ZohoSyncService, ZohoPullService, StripeAccountService],
  exports: [IntegrationConnectionService, ZohoSyncService, ZohoPullService, StripeAccountService],
})
export class IntegrationsModule {}
