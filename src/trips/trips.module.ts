import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversModule } from '../drivers/drivers.module';
import { LocationsModule } from '../locations/locations.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { TripLoad } from './entities/trip-load.entity';
import { TripStop } from './entities/trip-stop.entity';
import { Trip } from './entities/trip.entity';
import { TripAssignmentService } from './trip-assignment.service';
import { TripStopsService } from './trip-stops.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, TripStop, TripLoad]),
    LocationsModule,
    VehiclesModule,
    DriversModule,
    ShipmentsModule,
  ],
  controllers: [TripsController],
  providers: [TripsService, TripAssignmentService, TripStopsService],
  exports: [TripsService, TripAssignmentService],
})
export class TripsModule {}
