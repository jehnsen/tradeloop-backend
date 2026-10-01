import { AuditLog } from '../audit/audit-log.entity';
import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { NumberSequence } from '../common/sequence/number-sequence.entity';
import { Customer } from '../customers/customer.entity';
import { Document } from '../documents/document.entity';
import { Driver } from '../drivers/driver.entity';
import { Load } from '../loads/load.entity';
import { Location } from '../locations/location.entity';
import { AvailableLoadPosting } from '../marketplace/entities/load-posting.entity';
import { MarketplaceBooking } from '../marketplace/entities/marketplace-booking.entity';
import { MarketplaceMatch } from '../marketplace/entities/marketplace-match.entity';
import { MarketplaceOffer } from '../marketplace/entities/marketplace-offer.entity';
import { AvailableVehiclePosting } from '../marketplace/entities/vehicle-posting.entity';
import { Notification } from '../notifications/notification.entity';
import { Order } from '../orders/order.entity';
import { OrganizationMembership } from '../organizations/entities/organization-membership.entity';
import { OrganizationPartnership } from '../organizations/entities/organization-partnership.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Shipment } from '../shipments/shipment.entity';
import { VehicleLocation } from '../tracking/vehicle-location.entity';
import { TripLoad } from '../trips/entities/trip-load.entity';
import { TripStop } from '../trips/entities/trip-stop.entity';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

export const ENTITIES = [
  Organization,
  OrganizationMembership,
  OrganizationPartnership,
  User,
  RefreshSession,
  NumberSequence,
  Customer,
  Location,
  Vehicle,
  Driver,
  Order,
  Shipment,
  Load,
  Trip,
  TripStop,
  TripLoad,
  AvailableVehiclePosting,
  AvailableLoadPosting,
  MarketplaceOffer,
  MarketplaceMatch,
  MarketplaceBooking,
  VehicleLocation,
  Notification,
  Document,
  AuditLog,
];
