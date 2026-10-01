import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from '../shipments/shipment.entity';
import { Load } from './load.entity';
import { LoadsController } from './loads.controller';
import { LoadsService } from './loads.service';

@Module({
  imports: [TypeOrmModule.forFeature([Load, Shipment])],
  controllers: [LoadsController],
  providers: [LoadsService],
  exports: [LoadsService],
})
export class LoadsModule {}
