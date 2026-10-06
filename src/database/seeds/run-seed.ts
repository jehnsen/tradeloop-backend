/* eslint-disable no-console */
import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { CommissionType, OrganizationType, Role, VehicleType } from '../../common/enums';
import { toPoint } from '../../common/geo/geo';
import { hashPassword } from '../../common/utils/password';
import { Customer } from '../../customers/customer.entity';
import { Driver } from '../../drivers/driver.entity';
import { Load } from '../../loads/load.entity';
import { Location, LocationType } from '../../locations/location.entity';
import { AvailableLoadPosting } from '../../marketplace/entities/load-posting.entity';
import { PostingVisibility, PricingType } from '../../marketplace/entities/marketplace.enums';
import { AvailableVehiclePosting } from '../../marketplace/entities/vehicle-posting.entity';
import { Order, OrderStatus } from '../../orders/order.entity';
import { OrganizationMembership } from '../../organizations/entities/organization-membership.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Shipment } from '../../shipments/shipment.entity';
import { TripStop, TripStopType } from '../../trips/entities/trip-stop.entity';
import { Trip, TripStatus } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';
import { Vehicle } from '../../vehicles/vehicle.entity';
import dataSource, { appConfig } from '../data-source';
import { seedLucenaFresh } from './lucena-fresh';

/**
 * DEVELOPMENT ONLY. Creates demo tenants, users and marketplace data.
 * Credentials come from SEED_PASSWORD / SEED_ADMIN_EMAIL; refuses to run in production.
 */
const PASSWORD = process.env.SEED_PASSWORD ?? 'DevPassword123!';
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@tradeloop.local').toLowerCase();

const hours = (h: number) => new Date(Date.now() + h * 3_600_000);

async function nextNumber(m: EntityManager, prefix: string, scope: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const [row] = await m.query(
    `INSERT INTO number_sequences (scope, prefix, year, value) VALUES ($1, $2, $3, 1)
     ON CONFLICT (scope, prefix, year) DO UPDATE SET value = number_sequences.value + 1 RETURNING value`,
    [scope, prefix, year],
  );
  return `${prefix}-${year}-${String(row.value).padStart(6, '0')}`;
}

async function seed(m: EntityManager): Promise<string[]> {
  const passwordHash = await hashPassword(PASSWORD);
  const created: string[] = [];

  const org = (
    name: string,
    code: string,
    type: OrganizationType,
    extra: Partial<Organization> = {},
  ) =>
    m
      .getRepository(Organization)
      .save(
        m
          .getRepository(Organization)
          .create({ name, code, type, email: `hello@${code.toLowerCase()}.local`, ...extra }),
      );

  const user = async (
    organization: Organization,
    email: string,
    firstName: string,
    lastName: string,
    role: Role,
  ) => {
    const u = await m
      .getRepository(User)
      .save(m.getRepository(User).create({ email, passwordHash, firstName, lastName }));
    await m
      .getRepository(OrganizationMembership)
      .insert({ organizationId: organization.id, userId: u.id, role });
    created.push(`${email.padEnd(32)} ${role.padEnd(18)} ${organization.name}`);
    return u;
  };

  const location = (
    organizationId: string | null,
    name: string,
    city: string,
    province: string,
    lat: number,
    lng: number,
    type: LocationType,
    barangay?: string,
  ) =>
    m.getRepository(Location).save(
      m.getRepository(Location).create({
        organizationId,
        name,
        city,
        province,
        barangay: barangay ?? null,
        latitude: lat,
        longitude: lng,
        location: toPoint(lat, lng),
        type,
        country: 'PH',
      }),
    );

  // Organizations and users
  const platform = await org('Tradeloop Platform', 'TRADELOOP', OrganizationType.PLATFORM_ADMIN);
  await user(platform, ADMIN_EMAIL, 'Platform', 'Admin', Role.PLATFORM_ADMIN);

  const luzon = await org('Luzon Haulers Inc.', 'LUZONHAUL', OrganizationType.TRUCKING_COMPANY);
  await user(luzon, 'owner@luzonhaulers.local', 'Ramon', 'Garcia', Role.OWNER);
  await user(luzon, 'dispatch@luzonhaulers.local', 'Liza', 'Torres', Role.DISPATCHER);
  const luzonDriverUser = await user(
    luzon,
    'driver@luzonhaulers.local',
    'Juan',
    'Dela Cruz',
    Role.DRIVER,
  );

  const visayas = await org(
    'Visayas Freight Lines',
    'VISFREIGHT',
    OrganizationType.TRUCKING_COMPANY,
    {
      commissionType: CommissionType.PERCENTAGE,
      commissionValue: 4,
    },
  );
  await user(visayas, 'owner@visayasfreight.local', 'Carmela', 'Reyes', Role.OWNER);
  const visayasDriverUser = await user(
    visayas,
    'driver@visayasfreight.local',
    'Mario',
    'Bautista',
    Role.DRIVER,
  );

  const shipper = await org('Metro Goods Trading', 'METROGOODS', OrganizationType.SHIPPER);
  await user(shipper, 'owner@metrogoods.local', 'Angela', 'Lim', Role.OWNER);
  await user(shipper, 'ops@metrogoods.local', 'Paolo', 'Santos', Role.OPERATIONS_MANAGER);

  // Locations
  await location(
    null,
    'Port of Manila (South Harbor)',
    'Manila',
    'Metro Manila',
    14.5869,
    120.9686,
    LocationType.OTHER,
    'Port Area',
  );
  const luzonDepot = await location(
    luzon.id,
    'Luzon Haulers Depot',
    'Manila',
    'Metro Manila',
    14.6042,
    120.9822,
    LocationType.DEPOT,
    'Tondo',
  );
  const luzonBatangas = await location(
    luzon.id,
    'Batangas Port Yard',
    'Batangas City',
    'Batangas',
    13.7565,
    121.0583,
    LocationType.DEPOT,
  );
  const visayasDepot = await location(
    visayas.id,
    'Visayas Freight Calamba Hub',
    'Calamba',
    'Laguna',
    14.2117,
    121.1653,
    LocationType.DEPOT,
  );
  const visayasClark = await location(
    visayas.id,
    'Clark Freeport Yard',
    'Mabalacat',
    'Pampanga',
    15.1859,
    120.56,
    LocationType.DEPOT,
  );
  const shipperWarehouse = await location(
    shipper.id,
    'Metro Goods Valenzuela Warehouse',
    'Valenzuela',
    'Metro Manila',
    14.7011,
    120.983,
    LocationType.WAREHOUSE,
    'Karuhatan',
  );
  const shipperCustomerSite = await location(
    shipper.id,
    'Batangas Distribution Center',
    'Lipa',
    'Batangas',
    13.9411,
    121.1631,
    LocationType.CUSTOMER,
  );
  const shipperPampanga = await location(
    shipper.id,
    'San Fernando Store',
    'San Fernando',
    'Pampanga',
    15.0286,
    120.6898,
    LocationType.DELIVERY,
  );

  // Fleet
  const vehicles = m.getRepository(Vehicle);
  const tenWheeler = await vehicles.save(
    vehicles.create({
      organizationId: luzon.id,
      plateNumber: 'ABC-1234',
      vehicleType: VehicleType.TEN_WHEELER_TRUCK,
      make: 'Isuzu',
      model: 'Giga',
      year: 2021,
      maxWeightKg: 12_000,
      maxVolumeM3: 45,
    }),
  );
  await vehicles.save(
    vehicles.create({
      organizationId: luzon.id,
      plateNumber: 'NBC-5678',
      vehicleType: VehicleType.SIX_WHEELER_TRUCK,
      make: 'Hino',
      model: '300',
      year: 2020,
      maxWeightKg: 6_000,
      maxVolumeM3: 25,
    }),
  );
  const fourWheeler = await vehicles.save(
    vehicles.create({
      organizationId: visayas.id,
      plateNumber: 'XYZ-9012',
      vehicleType: VehicleType.FOUR_WHEELER_TRUCK,
      make: 'Mitsubishi',
      model: 'Canter',
      year: 2022,
      maxWeightKg: 3_500,
      maxVolumeM3: 15,
    }),
  );
  await vehicles.save(
    vehicles.create({
      organizationId: visayas.id,
      plateNumber: 'REF-3456',
      vehicleType: VehicleType.REFRIGERATED,
      make: 'Isuzu',
      model: 'Elf Reefer',
      year: 2023,
      maxWeightKg: 5_000,
      maxVolumeM3: 20,
    }),
  );

  const drivers = m.getRepository(Driver);
  const juan = await drivers.save(
    drivers.create({
      organizationId: luzon.id,
      userId: luzonDriverUser.id,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      phone: '+639171234567',
      licenseNumber: 'N01-12-345678',
      licenseExpiry: '2029-06-30',
    }),
  );
  await drivers.save(
    drivers.create({
      organizationId: luzon.id,
      firstName: 'Pedro',
      lastName: 'Santos',
      phone: '+639181234567',
      licenseNumber: 'N02-15-111222',
      licenseExpiry: '2028-01-31',
    }),
  );
  const mario = await drivers.save(
    drivers.create({
      organizationId: visayas.id,
      userId: visayasDriverUser.id,
      firstName: 'Mario',
      lastName: 'Bautista',
      phone: '+639191234567',
      licenseNumber: 'N03-18-333444',
      licenseExpiry: '2030-03-31',
    }),
  );

  // Shipper operations data
  const customer = await m.getRepository(Customer).save(
    m.getRepository(Customer).create({
      organizationId: shipper.id,
      name: 'Southern Retail Corp.',
      companyName: 'Southern Retail Corp.',
      email: 'purchasing@southernretail.local',
      phone: '+63431234567',
    }),
  );
  const order = await m.getRepository(Order).save(
    m.getRepository(Order).create({
      organizationId: shipper.id,
      customerId: customer.id,
      orderNumber: await nextNumber(m, 'ORD', shipper.id),
      status: OrderStatus.CONFIRMED,
      requestedPickupAt: hours(20),
      requestedDeliveryAt: hours(30),
    }),
  );
  const shipment = await m.getRepository(Shipment).save(
    m.getRepository(Shipment).create({
      organizationId: shipper.id,
      orderId: order.id,
      shipmentNumber: await nextNumber(m, 'SHP', shipper.id),
      pickupLocationId: shipperWarehouse.id,
      deliveryLocationId: shipperCustomerSite.id,
      pickupWindowStart: hours(18),
      pickupWindowEnd: hours(26),
      cargoDescription: 'Packaged consumer goods',
    }),
  );
  const loads = m.getRepository(Load);
  const palletLoad = await loads.save(
    loads.create({
      organizationId: shipper.id,
      shipmentId: shipment.id,
      description: '18 pallets of packaged snacks',
      cargoType: 'PALLETIZED',
      weightKg: 7_500,
      volumeM3: 30,
      quantity: 18,
      unit: 'PALLET',
    }),
  );
  await loads.save(
    loads.create({
      organizationId: shipper.id,
      description: 'Mixed cartons for San Fernando store',
      cargoType: 'CARTONS',
      weightKg: 1_800,
      volumeM3: 8,
      quantity: 120,
      unit: 'CARTON',
    }),
  );

  // Trips (with origin/destination stops)
  const trip = async (
    organizationId: string,
    vehicle: Vehicle,
    driver: Driver,
    origin: Location,
    destination: Location,
    departInHours: number,
  ) => {
    const t = await m.getRepository(Trip).save(
      m.getRepository(Trip).create({
        organizationId,
        tripNumber: await nextNumber(m, 'TRP', organizationId),
        vehicleId: vehicle.id,
        driverId: driver.id,
        originLocationId: origin.id,
        destinationLocationId: destination.id,
        scheduledDepartureAt: hours(departInHours),
        scheduledArrivalAt: hours(departInHours + 6),
        maxWeightKg: vehicle.maxWeightKg,
        maxVolumeM3: vehicle.maxVolumeM3,
        availableWeightKg: vehicle.maxWeightKg,
        availableVolumeM3: vehicle.maxVolumeM3,
        status: TripStatus.OPEN,
        isMarketplaceVisible: true,
      }),
    );
    await m.getRepository(TripStop).save([
      m.getRepository(TripStop).create({
        organizationId,
        tripId: t.id,
        sequence: 1,
        locationId: origin.id,
        type: TripStopType.ORIGIN,
        plannedDepartureAt: t.scheduledDepartureAt,
      }),
      m.getRepository(TripStop).create({
        organizationId,
        tripId: t.id,
        sequence: 2,
        locationId: destination.id,
        type: TripStopType.DESTINATION,
        plannedArrivalAt: t.scheduledArrivalAt,
      }),
    ]);
    return t;
  };
  const luzonTrip = await trip(luzon.id, tenWheeler, juan, luzonDepot, luzonBatangas, 20);
  const visayasTrip = await trip(visayas.id, fourWheeler, mario, visayasDepot, visayasClark, 24);

  // Marketplace postings
  const vp = m.getRepository(AvailableVehiclePosting);
  await vp.save(
    vp.create({
      organizationId: luzon.id,
      tripId: luzonTrip.id,
      vehicleId: tenWheeler.id,
      originLocationId: luzonDepot.id,
      destinationLocationId: luzonBatangas.id,
      originPoint: toPoint(luzonDepot.latitude, luzonDepot.longitude),
      destinationPoint: toPoint(luzonBatangas.latitude, luzonBatangas.longitude),
      departureFrom: hours(18),
      departureUntil: hours(24),
      availableWeightKg: 12_000,
      availableVolumeM3: 45,
      vehicleType: tenWheeler.vehicleType,
      askingPrice: 18_000,
      pricingType: PricingType.NEGOTIABLE,
      visibility: PostingVisibility.NETWORK,
      expiresAt: hours(24),
      notes: 'Backload available Manila to Batangas',
    }),
  );
  await vp.save(
    vp.create({
      organizationId: visayas.id,
      tripId: visayasTrip.id,
      vehicleId: fourWheeler.id,
      originLocationId: visayasDepot.id,
      destinationLocationId: visayasClark.id,
      originPoint: toPoint(visayasDepot.latitude, visayasDepot.longitude),
      destinationPoint: toPoint(visayasClark.latitude, visayasClark.longitude),
      departureFrom: hours(22),
      departureUntil: hours(28),
      availableWeightKg: 3_500,
      availableVolumeM3: 15,
      vehicleType: fourWheeler.vehicleType,
      askingPrice: 9_500,
      pricingType: PricingType.FIXED,
      visibility: PostingVisibility.NETWORK,
      expiresAt: hours(28),
    }),
  );
  const lp = m.getRepository(AvailableLoadPosting);
  await lp.save(
    lp.create({
      organizationId: shipper.id,
      loadId: palletLoad.id,
      pickupLocationId: shipperWarehouse.id,
      deliveryLocationId: shipperCustomerSite.id,
      pickupPoint: toPoint(shipperWarehouse.latitude, shipperWarehouse.longitude),
      deliveryPoint: toPoint(shipperCustomerSite.latitude, shipperCustomerSite.longitude),
      pickupFrom: hours(18),
      pickupUntil: hours(26),
      weightKg: 7_500,
      volumeM3: 30,
      budget: 15_000,
      visibility: PostingVisibility.NETWORK,
      expiresAt: hours(26),
      notes: 'Palletized, forklift available at pickup',
    }),
  );
  await lp.save(
    lp.create({
      organizationId: shipper.id,
      pickupLocationId: shipperWarehouse.id,
      deliveryLocationId: shipperPampanga.id,
      pickupPoint: toPoint(shipperWarehouse.latitude, shipperWarehouse.longitude),
      deliveryPoint: toPoint(shipperPampanga.latitude, shipperPampanga.longitude),
      pickupFrom: hours(20),
      pickupUntil: hours(30),
      weightKg: 1_800,
      volumeM3: 8,
      requiredVehicleType: VehicleType.FOUR_WHEELER_TRUCK,
      budget: 6_000,
      visibility: PostingVisibility.NETWORK,
      expiresAt: hours(30),
    }),
  );
  return created;
}

async function main(): Promise<void> {
  if (appConfig.isProduction && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to seed a production environment (set SEED_ALLOW_PRODUCTION=true to override).',
    );
  }
  const ds: DataSource = await dataSource.initialize();
  try {
    const exists = await ds.getRepository(User).exists({ where: { email: ADMIN_EMAIL } });
    const users = exists ? [] : await ds.transaction(seed);
    if (exists) console.log(`Marketplace seed skipped: ${ADMIN_EMAIL} already exists.`);
    const lucena = await ds.transaction((m) => seedLucenaFresh(m, PASSWORD));
    if (!lucena.length) console.log('TradeLoop demo seed skipped: Lucena Fresh already exists.');
    if (!users.length && !lucena.length) return;
    console.log(
      'Development seed complete. All accounts use SEED_PASSWORD (default "DevPassword123!"):',
    );
    for (const line of [...users, ...lucena]) console.log(`  ${line}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
