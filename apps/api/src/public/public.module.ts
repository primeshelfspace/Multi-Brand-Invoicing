import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PublicInvoicesController } from './public-invoices.controller.js';
import { PublicInvoicesService } from './public-invoices.service.js';

@Module({
  imports: [PaymentsModule, IntegrationsModule],
  controllers: [PublicInvoicesController],
  providers: [PublicInvoicesService],
})
export class PublicModule {}
