import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../drivers/driver.entity';
import { Location } from '../locations/location.entity';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { TrackingController } from './tracking.controller';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';
import { VehicleLocation } from './vehicle-location.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleLocation, Trip, Vehicle, Driver, Location]),
    MarketplaceModule,
  ],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingGateway],
  exports: [TrackingService],
})
export class TrackingModule {}
