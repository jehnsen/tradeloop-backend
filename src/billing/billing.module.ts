import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CommissionService } from './commission.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, CommissionService],
  exports: [CommissionService],
})
export class BillingModule {}
