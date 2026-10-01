import {
  Client,
  createTestApp,
  hoursFromNow,
  login,
  PASSWORD,
  registerOrg,
  TestApp,
  uniqueEmail,
} from './utils';

/**
 * Critical rule: a user from Organization A must never read or modify Organization B's private
 * records by ID manipulation, nor reference them from its own records.
 */
describe('Tenant isolation and RBAC (e2e)', () => {
  let t: TestApp;
  let a: Client;
  let b: Client;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    a = (await registerOrg(t.app, 'TRUCKING_COMPANY', 'Isolation A')).client;
    b = (await registerOrg(t.app, 'TRUCKING_COMPANY', 'Isolation B')).client;

    ids.customer = (
      await a.post('/customers', { name: 'Secret Customer', taxId: '123-456' }).expect(201)
    ).body.data.id;
    ids.location = (
      await a
        .post('/locations', {
          name: 'A Depot',
          city: 'Manila',
          province: 'Metro Manila',
          latitude: 14.6,
          longitude: 120.98,
        })
        .expect(201)
    ).body.data.id;
    ids.location2 = (
      await a
        .post('/locations', {
          name: 'A Yard',
          city: 'Batangas City',
          province: 'Batangas',
          latitude: 13.75,
          longitude: 121.05,
        })
        .expect(201)
    ).body.data.id;
    ids.vehicle = (
      await a
        .post('/vehicles', { plateNumber: 'ISO-0001', vehicleType: '6W_TRUCK', maxWeightKg: 6000 })
        .expect(201)
    ).body.data.id;
    ids.driver = (
      await a
        .post('/drivers', { firstName: 'A', lastName: 'Driver', licenseNumber: 'LIC-A-1' })
        .expect(201)
    ).body.data.id;
    ids.order = (await a.post('/orders', { customerId: ids.customer }).expect(201)).body.data.id;
    ids.shipment = (
      await a
        .post('/shipments', {
          orderId: ids.order,
          pickupLocationId: ids.location,
          deliveryLocationId: ids.location2,
        })
        .expect(201)
    ).body.data.id;
    ids.load = (
      await a
        .post('/loads', {
          shipmentId: ids.shipment,
          description: 'Confidential cargo',
          weightKg: 1000,
        })
        .expect(201)
    ).body.data.id;
    ids.trip = (
      await a
        .post('/trips', {
          vehicleId: ids.vehicle,
          driverId: ids.driver,
          originLocationId: ids.location,
          destinationLocationId: ids.location2,
          scheduledDepartureAt: hoursFromNow(5),
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(() => t.close());

  const resources = [
    'customers',
    'locations',
    'vehicles',
    'drivers',
    'orders',
    'shipments',
    'loads',
    'trips',
  ] as const;
  const key: Record<(typeof resources)[number], string> = {
    customers: 'customer',
    locations: 'location',
    vehicles: 'vehicle',
    drivers: 'driver',
    orders: 'order',
    shipments: 'shipment',
    loads: 'load',
    trips: 'trip',
  };

  const patchBody: Record<(typeof resources)[number], object> = {
    customers: { name: 'hijack' },
    locations: { name: 'hijack' },
    vehicles: { make: 'hijack' },
    drivers: { phone: 'hijack' },
    orders: { notes: 'hijack' },
    shipments: { cargoDescription: 'hijack' },
    loads: { description: 'hijack' },
    trips: { notes: 'hijack' },
  };

  it.each(resources)(
    'organization B cannot read, update or delete A %s by id',
    async (resource) => {
      const id = ids[key[resource]];
      await b.get(`/${resource}/${id}`).expect(404);
      await b.patch(`/${resource}/${id}`, patchBody[resource]).expect(404);
      await b.delete(`/${resource}/${id}`).expect(404);
      await a.get(`/${resource}/${id}`).expect(200);
    },
  );

  it.each(resources)('organization B never sees A %s in listings', async (resource) => {
    const res = await b.get(`/${resource}?limit=100`).expect(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).not.toContain(ids[key[resource]]);
  });

  it('blocks referencing another tenant’s records when creating or acting', async () => {
    await b.post('/orders', { customerId: ids.customer }).expect(404);
    await b
      .post('/shipments', { pickupLocationId: ids.location, deliveryLocationId: ids.location2 })
      .expect(404);
    await b.post('/loads', { shipmentId: ids.shipment, description: 'x', weightKg: 1 }).expect(404);
    await b
      .post('/trips', {
        vehicleId: ids.vehicle,
        originLocationId: ids.location,
        destinationLocationId: ids.location2,
        scheduledDepartureAt: hoursFromNow(1),
      })
      .expect(404);
    await b.post(`/trips/${ids.trip}/dispatch`).expect(404);
    await b.post(`/orders/${ids.order}/cancel`).expect(404);

    const bLoc = (
      await b
        .post('/locations', {
          name: 'B',
          city: 'Cebu',
          province: 'Cebu',
          latitude: 10.3,
          longitude: 123.9,
        })
        .expect(201)
    ).body.data.id;
    const bTrip = (
      await b
        .post('/trips', {
          originLocationId: bLoc,
          destinationLocationId: bLoc,
          scheduledDepartureAt: hoursFromNow(2),
          maxWeightKg: 5000,
        })
        .expect(201)
    ).body.data.id;
    await b.post(`/trips/${bTrip}/loads/${ids.load}/assign`, {}).expect(404);
    await b.get(`/tracking/trips/${ids.trip}/current`).expect(404);
    await b.get(`/documents?entityType=ORDER&entityId=${ids.order}`).expect(404);
    await b
      .post('/marketplace/loads', { loadId: ids.load, pickupFrom: hoursFromNow(1) })
      .expect(404);
    await b.post('/marketplace/vehicles', { tripId: ids.trip }).expect(404);
  });

  it('ignores organizationId supplied by the client', async () => {
    const res = await b
      .post('/customers', { name: 'Sneaky', organizationId: ids.customer })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('enforces roles inside an organization', async () => {
    const owner = await registerOrg(t.app, 'TRUCKING_COMPANY', 'RBAC Org');
    const viewerEmail = uniqueEmail('viewer');
    const driverEmail = uniqueEmail('driver');
    await owner.client
      .post('/organizations/current/memberships', {
        email: viewerEmail,
        role: 'VIEWER',
        firstName: 'V',
        lastName: 'V',
        password: PASSWORD,
      })
      .expect(201);
    await owner.client
      .post('/organizations/current/memberships', {
        email: driverEmail,
        role: 'DRIVER',
        firstName: 'D',
        lastName: 'D',
        password: PASSWORD,
      })
      .expect(201);
    const viewer = await login(t.app, viewerEmail);
    const driver = await login(t.app, driverEmail);

    await viewer.get('/vehicles').expect(200);
    const denied = await viewer
      .post('/vehicles', { plateNumber: 'NOPE-1', vehicleType: 'VAN', maxWeightKg: 500 })
      .expect(403);
    expect(denied.body.code).toBe('INSUFFICIENT_ROLE');
    await driver.post('/customers', { name: 'x' }).expect(403);
    await viewer
      .post('/organizations/current/memberships', { email: uniqueEmail('x'), role: 'OWNER' })
      .expect(403);
    await owner.client.get('/admin/organizations').expect(403);

    // Admin cannot grant OWNER or PLATFORM_ADMIN.
    const adminEmail = uniqueEmail('admin');
    await owner.client
      .post('/organizations/current/memberships', {
        email: adminEmail,
        role: 'ADMIN',
        firstName: 'A',
        lastName: 'A',
        password: PASSWORD,
      })
      .expect(201);
    const admin = await login(t.app, adminEmail);
    await admin
      .post('/organizations/current/memberships', {
        email: uniqueEmail('o'),
        role: 'OWNER',
        firstName: 'O',
        lastName: 'O',
        password: PASSWORD,
      })
      .expect(403);
    await admin
      .post('/organizations/current/memberships', {
        email: uniqueEmail('p'),
        role: 'PLATFORM_ADMIN',
        firstName: 'P',
        lastName: 'P',
        password: PASSWORD,
      })
      .expect(403);
  });

  it('keeps at least one owner', async () => {
    const owner = await registerOrg(t.app, 'SHIPPER', 'Last Owner');
    const members = await owner.client.get('/organizations/current/memberships').expect(200);
    const res = await owner.client
      .patch(`/organizations/current/memberships/${members.body.data[0].id}`, { role: 'ADMIN' })
      .expect(409);
    expect(res.body.code).toBe('LAST_OWNER');
  });
});
