import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { LocationsModule } from '../locations/locations.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { TripsModule } from '../trips/trips.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { BookingsService } from './bookings.service';
import { AvailableLoadPosting } from './entities/load-posting.entity';
import { MarketplaceBooking } from './entities/marketplace-booking.entity';
import { MarketplaceMatch } from './entities/marketplace-match.entity';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import { AvailableVehiclePosting } from './entities/vehicle-posting.entity';
import { LoadPostingsService } from './load-postings.service';
import {
  BookingsController,
  LoadPostingsController,
  OffersController,
  VehiclePostingsController,
} from './marketplace.controller';
import { OffersService } from './offers.service';
import { VehiclePostingsService } from './vehicle-postings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AvailableVehiclePosting,
      AvailableLoadPosting,
      MarketplaceOffer,
      MarketplaceBooking,
      MarketplaceMatch,
    ]),
    LocationsModule,
    VehiclesModule,
    TripsModule,
    ShipmentsModule,
    BillingModule,
  ],
  controllers: [
    VehiclePostingsController,
    LoadPostingsController,
    OffersController,
    BookingsController,
  ],
  providers: [VehiclePostingsService, LoadPostingsService, OffersService, BookingsService],
  exports: [VehiclePostingsService, LoadPostingsService, BookingsService],
})
export class MarketplaceModule {}
