import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { OpsStore } from './persistence/ops-store';
import { PublicOpsController } from './public-ops.controller';

/** TradeLoop operations: jobs, trips, deliveries, billing, fleet, Load Board and backhaul. */
@Module({
  imports: [AuditModule],
  controllers: [OpsController, PublicOpsController],
  providers: [OpsService, OpsStore],
  exports: [OpsService, OpsStore],
})
export class OpsModule {}
