import { Location } from '../locations/location.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { AvailableLoadPosting } from './entities/load-posting.entity';
import { MarketplaceBooking } from './entities/marketplace-booking.entity';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import { AvailableVehiclePosting } from './entities/vehicle-posting.entity';

/**
 * Marketplace responses are built field-by-field so private tenant data (customers, internal
 * notes on loads, plate numbers, drivers, exact addresses) is never serialized to other tenants.
 */

const orgView = (org: Organization | undefined, id: string) =>
  org ? { id: org.id, name: org.name, type: org.type } : { id };

export function locationView(location: Location | undefined, isOwner: boolean) {
  if (!location) return null;
  const shared = {
    barangay: location.barangay,
    city: location.city,
    province: location.province,
    country: location.country,
    latitude: location.latitude,
    longitude: location.longitude,
  };
  return isOwner
    ? { id: location.id, name: location.name, addressLine: location.addressLine, ...shared }
    : shared;
}

export function vehiclePostingView(p: AvailableVehiclePosting, viewerOrganizationId: string) {
  const isOwn = p.organizationId === viewerOrganizationId;
  return {
    id: p.id,
    organization: orgView(p.organization, p.organizationId),
    origin: locationView(p.originLocation, isOwn),
    destination: locationView(p.destinationLocation, isOwn),
    departureFrom: p.departureFrom,
    departureUntil: p.departureUntil,
    availableWeightKg: p.availableWeightKg,
    availableVolumeM3: p.availableVolumeM3,
    vehicleType: p.vehicleType,
    askingPrice: p.askingPrice,
    currency: p.currency,
    pricingType: p.pricingType,
    visibility: p.visibility,
    status: p.status,
    notes: p.notes,
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isOwn,
    ...(isOwn ? { tripId: p.tripId, vehicleId: p.vehicleId } : {}),
  };
}

export function loadPostingView(p: AvailableLoadPosting, viewerOrganizationId: string) {
  const isOwn = p.organizationId === viewerOrganizationId;
  return {
    id: p.id,
    organization: orgView(p.organization, p.organizationId),
    pickup: locationView(p.pickupLocation, isOwn),
    delivery: locationView(p.deliveryLocation, isOwn),
    pickupFrom: p.pickupFrom,
    pickupUntil: p.pickupUntil,
    weightKg: p.weightKg,
    volumeM3: p.volumeM3,
    requiredVehicleType: p.requiredVehicleType,
    budget: p.budget,
    currency: p.currency,
    visibility: p.visibility,
    status: p.status,
    notes: p.notes,
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isOwn,
    ...(isOwn ? { loadId: p.loadId } : {}),
  };
}

export function offerView(o: MarketplaceOffer, viewerOrganizationId: string) {
  return {
    id: o.id,
    parentOfferId: o.parentOfferId,
    createdByOrganization: orgView(o.createdByOrganization, o.createdByOrganizationId),
    targetOrganization: orgView(o.targetOrganization, o.targetOrganizationId),
    direction: o.createdByOrganizationId === viewerOrganizationId ? 'SENT' : 'RECEIVED',
    vehiclePostingId: o.vehiclePostingId,
    loadPostingId: o.loadPostingId,
    vehiclePosting: o.vehiclePosting
      ? vehiclePostingView(o.vehiclePosting, viewerOrganizationId)
      : undefined,
    loadPosting: o.loadPosting ? loadPostingView(o.loadPosting, viewerOrganizationId) : undefined,
    amount: o.amount,
    currency: o.currency,
    message: o.message,
    status: o.status,
    expiresAt: o.expiresAt,
    respondedAt: o.respondedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function bookingView(b: MarketplaceBooking, viewerOrganizationId: string) {
  const isCarrier = b.carrierOrganizationId === viewerOrganizationId;
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    loadPostingId: b.loadPostingId,
    vehiclePostingId: b.vehiclePostingId,
    offerId: b.offerId,
    shipperOrganization: orgView(b.shipperOrganization, b.shipperOrganizationId),
    carrierOrganization: orgView(b.carrierOrganization, b.carrierOrganizationId),
    tripId: b.tripId,
    loadId: b.loadId,
    agreedAmount: b.agreedAmount,
    currency: b.currency,
    status: b.status,
    completedAt: b.completedAt,
    cancelledAt: b.cancelledAt,
    cancellationReason: b.cancellationReason,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    role: isCarrier ? 'CARRIER' : 'SHIPPER',
    // Platform commission is a carrier-side charge and is not disclosed to the shipper.
    ...(isCarrier
      ? {
          platformCommissionType: b.platformCommissionType,
          platformCommissionValue: b.platformCommissionValue,
          platformCommissionAmount: b.platformCommissionAmount,
          carrierNetAmount: b.carrierNetAmount,
        }
      : {}),
  };
}
