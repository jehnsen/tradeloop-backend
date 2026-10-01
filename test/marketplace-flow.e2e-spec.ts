import { io, Socket } from 'socket.io-client';
import {
  Client,
  createTestApp,
  eventually,
  hoursFromNow,
  login,
  PASSWORD,
  PNG_BYTES,
  registerOrg,
  TestApp,
  uniqueEmail,
} from './utils';

/**
 * Completion workflow: organizations -> shipment/load -> trip -> marketplace postings -> matching ->
 * notification -> offer -> acceptance/booking -> dispatch -> GPS/live tracking -> stops -> completion
 * -> commission -> audit.
 */
describe('Marketplace end-to-end workflow', () => {
  let t: TestApp;
  let carrier: Client;
  let carrierOrgId: string;
  let shipper: Client;
  let shipperOrgId: string;
  let rival: Client;
  let driver: Client;
  const ids: Record<string, string> = {};
  const sockets: Socket[] = [];

  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(`${t.baseUrl}/realtime`, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  beforeAll(async () => {
    t = await createTestApp();
    ({ client: carrier, organizationId: carrierOrgId } = await registerOrg(
      t.app,
      'TRUCKING_COMPANY',
      'Flow Carrier',
    ));
    ({ client: shipper, organizationId: shipperOrgId } = await registerOrg(
      t.app,
      'SHIPPER',
      'Flow Shipper',
    ));
    ({ client: rival } = await registerOrg(t.app, 'TRUCKING_COMPANY', 'Flow Rival'));

    const driverEmail = uniqueEmail('driver');
    const member = await carrier
      .post('/organizations/current/memberships', {
        email: driverEmail,
        role: 'DRIVER',
        firstName: 'Juan',
        lastName: 'Driver',
        password: PASSWORD,
      })
      .expect(201);
    driver = await login(t.app, driverEmail);
    ids.driverUser = member.body.data.userId;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await t.close();
  });

  it('sets up shipper operations: customer, locations, order, shipment, load', async () => {
    ids.customer = (
      await shipper
        .post('/customers', { name: 'Southern Retail', email: 'buyer@retail.local' })
        .expect(201)
    ).body.data.id;
    ids.warehouse = (
      await shipper
        .post('/locations', {
          name: 'Valenzuela Warehouse',
          addressLine: '12 Secret St',
          city: 'Valenzuela',
          province: 'Metro Manila',
          latitude: 14.7011,
          longitude: 120.983,
          type: 'WAREHOUSE',
        })
        .expect(201)
    ).body.data.id;
    ids.dc = (
      await shipper
        .post('/locations', {
          name: 'Lipa DC',
          city: 'Lipa',
          province: 'Batangas',
          latitude: 13.9411,
          longitude: 121.1631,
          type: 'CUSTOMER',
        })
        .expect(201)
    ).body.data.id;

    const order = await shipper
      .post('/orders', { customerId: ids.customer, externalReference: 'PO-778', confirm: true })
      .expect(201);
    expect(order.body.data.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);
    expect(order.body.data.status).toBe('CONFIRMED');
    ids.order = order.body.data.id;

    const shipment = await shipper
      .post('/shipments', {
        orderId: ids.order,
        pickupLocationId: ids.warehouse,
        deliveryLocationId: ids.dc,
        pickupWindowStart: hoursFromNow(18),
        pickupWindowEnd: hoursFromNow(26),
      })
      .expect(201);
    expect(shipment.body.data.shipmentNumber).toMatch(/^SHP-/);
    ids.shipment = shipment.body.data.id;
    ids.load = (
      await shipper
        .post('/loads', {
          shipmentId: ids.shipment,
          description: 'Pallets of snacks',
          cargoType: 'PALLETIZED',
          weightKg: 7500,
          volumeM3: 30,
        })
        .expect(201)
    ).body.data.id;

    const filtered = await shipper
      .get('/orders?externalReference=PO-778&status=CONFIRMED')
      .expect(200);
    expect(filtered.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('sets up the carrier fleet and a trip', async () => {
    ids.depot = (
      await carrier
        .post('/locations', {
          name: 'Tondo Depot',
          city: 'Manila',
          province: 'Metro Manila',
          latitude: 14.6042,
          longitude: 120.9822,
          type: 'DEPOT',
        })
        .expect(201)
    ).body.data.id;
    ids.yard = (
      await carrier
        .post('/locations', {
          name: 'Batangas Yard',
          city: 'Batangas City',
          province: 'Batangas',
          latitude: 13.7565,
          longitude: 121.0583,
          type: 'DEPOT',
        })
        .expect(201)
    ).body.data.id;
    ids.vehicle = (
      await carrier
        .post('/vehicles', {
          plateNumber: 'abc-1234',
          vehicleType: '10W_TRUCK',
          maxWeightKg: 12000,
          maxVolumeM3: 45,
        })
        .expect(201)
    ).body.data.id;
    ids.driver = (
      await carrier
        .post('/drivers', {
          userId: ids.driverUser,
          firstName: 'Juan',
          lastName: 'Driver',
          licenseNumber: 'N01-99-000001',
          licenseExpiry: '2030-01-01',
        })
        .expect(201)
    ).body.data.id;

    const trip = await carrier
      .post('/trips', {
        vehicleId: ids.vehicle,
        driverId: ids.driver,
        originLocationId: ids.depot,
        destinationLocationId: ids.yard,
        scheduledDepartureAt: hoursFromNow(20),
        scheduledArrivalAt: hoursFromNow(26),
      })
      .expect(201);
    expect(trip.body.data).toMatchObject({
      status: 'DRAFT',
      maxWeightKg: 12000,
      availableWeightKg: 12000,
    });
    expect(trip.body.data.tripNumber).toMatch(/^TRP-/);
    expect(trip.body.data.stops.map((s: { type: string }) => s.type)).toEqual([
      'ORIGIN',
      'DESTINATION',
    ]);
    ids.trip = trip.body.data.id;

    await carrier.post(`/trips/${ids.trip}/start`).expect(409);
  });

  it('publishes available truck capacity and an available load', async () => {
    const vp = await carrier
      .post('/marketplace/vehicles', {
        tripId: ids.trip,
        departureFrom: hoursFromNow(18),
        departureUntil: hoursFromNow(24),
        askingPrice: 18000,
      })
      .expect(201);
    expect(vp.body.data).toMatchObject({
      status: 'OPEN',
      availableWeightKg: 12000,
      vehicleType: '10W_TRUCK',
      isOwn: true,
      tripId: ids.trip,
    });
    ids.vehiclePosting = vp.body.data.id;
    expect((await carrier.get(`/trips/${ids.trip}`).expect(200)).body.data).toMatchObject({
      status: 'OPEN',
      isMarketplaceVisible: true,
    });

    const lp = await shipper
      .post('/marketplace/loads', { loadId: ids.load, budget: 16000, notes: 'Forklift on site' })
      .expect(201);
    expect(lp.body.data).toMatchObject({
      status: 'OPEN',
      weightKg: 7500,
      isOwn: true,
      loadId: ids.load,
    });
    ids.loadPosting = lp.body.data.id;
  });

  it('marketplace responses do not leak private tenant data', async () => {
    const browse = await carrier
      .get('/marketplace/loads?originLat=14.70&originLng=120.98&originRadiusKm=25&minWeightKg=0')
      .expect(400);
    expect(browse.body.code).toBe('VALIDATION_ERROR');

    const res = await carrier
      .get(
        '/marketplace/loads?originLat=14.70&originLng=120.98&originRadiusKm=25&vehicleType=10W_TRUCK',
      )
      .expect(200);
    const posting = res.body.data.find((p: { id: string }) => p.id === ids.loadPosting);
    expect(posting).toBeDefined();
    expect(posting.isOwn).toBe(false);
    expect(posting).not.toHaveProperty('loadId');
    expect(posting.pickup).not.toHaveProperty('name');
    expect(posting.pickup).not.toHaveProperty('addressLine');
    expect(posting.pickup).not.toHaveProperty('id');
    expect(Object.keys(posting.organization).sort()).toEqual(['id', 'name', 'type']);
    expect(JSON.stringify(res.body)).not.toMatch(
      /Secret St|Southern Retail|Pallets of snacks|PO-778/,
    );

    const far = await carrier
      .get('/marketplace/loads?originLat=10.31&originLng=123.88&originRadiusKm=50')
      .expect(200);
    expect(far.body.data.map((p: { id: string }) => p.id)).not.toContain(ids.loadPosting);

    const trucks = await shipper
      .get('/marketplace/vehicles?destinationProvince=Batangas&minWeightKg=7000')
      .expect(200);
    const truck = trucks.body.data.find((p: { id: string }) => p.id === ids.vehiclePosting);
    expect(truck).toBeDefined();
    expect(truck).not.toHaveProperty('tripId');
    expect(truck).not.toHaveProperty('vehicleId');
    expect(JSON.stringify(truck)).not.toMatch(/ABC-1234|Tondo Depot|Juan/);
  });

  it('matches the load to the truck with PostGIS and notifies both parties', async () => {
    const matches = await shipper.get(`/matching/load/${ids.loadPosting}/trucks`).expect(200);
    const match = matches.body.data.find(
      (m: { posting: { id: string } }) => m.posting.id === ids.vehiclePosting,
    );
    expect(match).toBeDefined();
    expect(match.score).toBeGreaterThanOrEqual(40);
    expect(match.score).toBeLessThanOrEqual(100);
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(match.estimatedPickupDetourKm).toBeGreaterThanOrEqual(0);
    expect(match.estimatedDropoffDetourKm).toBeGreaterThanOrEqual(0);

    const reverse = await carrier.get(`/matching/truck/${ids.vehiclePosting}/loads`).expect(200);
    expect(reverse.body.data.map((m: { posting: { id: string } }) => m.posting.id)).toContain(
      ids.loadPosting,
    );
    await shipper.get(`/matching/truck/${ids.vehiclePosting}/loads`).expect(404);

    const note = await eventually(async () => {
      const res = await carrier.get('/notifications').expect(200);
      return res.body.data.find((n: { type: string }) => n.type === 'MARKETPLACE_MATCH_FOUND');
    });
    expect(note.data).toMatchObject({
      loadPostingId: ids.loadPosting,
      vehiclePostingId: ids.vehiclePosting,
    });
    await eventually(
      async () =>
        (await shipper.get(`/marketplace/loads/${ids.loadPosting}`)).body.data.status === 'MATCHED',
    );
  });

  it('carriers submit offers; the shipper counters and the carrier responds', async () => {
    const offer = await carrier
      .post('/marketplace/offers', {
        loadPostingId: ids.loadPosting,
        vehiclePostingId: ids.vehiclePosting,
        amount: 16000,
        message: 'Can load tomorrow',
      })
      .expect(201);
    expect(offer.body.data).toMatchObject({
      status: 'PENDING',
      direction: 'SENT',
      amount: 16000,
      currency: 'PHP',
    });
    await carrier
      .post('/marketplace/offers', {
        loadPostingId: ids.loadPosting,
        vehiclePostingId: ids.vehiclePosting,
        amount: 15500,
      })
      .expect(409);

    await eventually(async () =>
      (await shipper.get('/notifications?unreadOnly=true')).body.data.find(
        (n: { type: string }) => n.type === 'OFFER_RECEIVED',
      ),
    );
    const received = await shipper.get('/marketplace/offers/received?status=PENDING').expect(200);
    expect(received.body.data.map((o: { id: string }) => o.id)).toContain(offer.body.data.id);

    await carrier.post(`/marketplace/offers/${offer.body.data.id}/accept`).expect(403);
    const counter = await shipper
      .post(`/marketplace/offers/${offer.body.data.id}/counter`, { amount: 15000 })
      .expect(201);
    expect(counter.body.data).toMatchObject({
      status: 'PENDING',
      parentOfferId: offer.body.data.id,
      amount: 15000,
    });
    expect((await carrier.get(`/marketplace/offers/${offer.body.data.id}`)).body.data.status).toBe(
      'COUNTERED',
    );
    ids.counterOffer = counter.body.data.id;

    const rivalOffer = await rival
      .post('/marketplace/offers', { loadPostingId: ids.loadPosting, amount: 14000 })
      .expect(201);
    ids.rivalOffer = rivalOffer.body.data.id;
  });

  it('serializes concurrent acceptances so only one booking can exist for the load', async () => {
    // Shipper accepts the rival's offer while the carrier accepts the shipper's counter offer.
    const [a, b] = await Promise.all([
      carrier.post(`/marketplace/offers/${ids.counterOffer}/accept`),
      shipper.post(`/marketplace/offers/${ids.rivalOffer}/accept`),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;

    if (winner === b) {
      // Rival won: cancel that booking so the main flow can proceed with the counter offer re-created.
      await shipper
        .post(`/marketplace/bookings/${b.body.data.id}/cancel`, { reason: 'test reset' })
        .expect(200);
      const reoffer = await carrier
        .post('/marketplace/offers', {
          loadPostingId: ids.loadPosting,
          vehiclePostingId: ids.vehiclePosting,
          amount: 15000,
        })
        .expect(201);
      const accepted = await shipper
        .post(`/marketplace/offers/${reoffer.body.data.id}/accept`)
        .expect(200);
      ids.booking = accepted.body.data.id;
    } else {
      ids.booking = a.body.data.id;
    }

    const shipperBookings = await shipper.get('/marketplace/bookings?role=shipper').expect(200);
    const active = shipperBookings.body.data.filter(
      (x: { loadPostingId: string; status: string }) =>
        x.loadPostingId === ids.loadPosting && x.status !== 'CANCELLED',
    );
    expect(active).toHaveLength(1);
    await shipper.post(`/marketplace/offers/${ids.rivalOffer}/accept`).expect(409);
  });

  it('creates the booking with commission and assigns the load to the carrier trip', async () => {
    const asCarrier = (await carrier.get(`/marketplace/bookings/${ids.booking}`).expect(200)).body
      .data;
    expect(asCarrier).toMatchObject({
      role: 'CARRIER',
      status: 'CONFIRMED',
      agreedAmount: 15000,
      tripId: ids.trip,
      platformCommissionType: 'PERCENTAGE',
      platformCommissionValue: 5,
      platformCommissionAmount: 750,
      carrierNetAmount: 14250,
    });
    expect(asCarrier.bookingNumber).toMatch(/^BKG-/);
    const asShipper = (await shipper.get(`/marketplace/bookings/${ids.booking}`).expect(200)).body
      .data;
    expect(asShipper.role).toBe('SHIPPER');
    expect(asShipper).not.toHaveProperty('platformCommissionAmount');
    expect(asShipper).not.toHaveProperty('carrierNetAmount');
    await rival.get(`/marketplace/bookings/${ids.booking}`).expect(404);

    const trip = (await carrier.get(`/trips/${ids.trip}`).expect(200)).body.data;
    expect(trip.availableWeightKg).toBe(4500);
    expect(trip.loads).toHaveLength(1);
    expect(trip.loads[0]).toMatchObject({
      loadId: ids.load,
      status: 'ASSIGNED',
      bookingId: ids.booking,
      allocatedWeightKg: 7500,
    });
    expect(trip.stops.map((s: { type: string }) => s.type)).toEqual([
      'ORIGIN',
      'PICKUP',
      'DROPOFF',
      'DESTINATION',
    ]);
    ids.pickupStop = trip.stops[1].id;
    ids.dropoffStop = trip.stops[2].id;

    expect((await shipper.get(`/marketplace/loads/${ids.loadPosting}`)).body.data.status).toBe(
      'BOOKED',
    );
    expect(
      (await carrier.get(`/marketplace/vehicles/${ids.vehiclePosting}`)).body.data
        .availableWeightKg,
    ).toBe(4500);
    expect((await shipper.get(`/shipments/${ids.shipment}`)).body.data.status).toBe('ASSIGNED');
    await eventually(
      async () => (await shipper.get(`/orders/${ids.order}`)).body.data.status === 'PROCESSING',
    );
    await carrier.delete(`/trips/${ids.trip}/loads/${ids.load}`).expect(409);
  });

  it('never lets trip capacity be exceeded', async () => {
    const own = (
      await carrier.post('/loads', { description: 'Extra cargo', weightKg: 5000 }).expect(201)
    ).body.data.id;
    const res = await carrier
      .post(`/trips/${ids.trip}/loads/${own}/assign`, {
        pickupLocationId: ids.depot,
        dropoffLocationId: ids.yard,
      })
      .expect(409);
    expect(res.body.code).toBe('CAPACITY_EXCEEDED');

    const fits = (
      await carrier.post('/loads', { description: 'Small cargo', weightKg: 300 }).expect(201)
    ).body.data.id;
    await carrier
      .post(`/trips/${ids.trip}/loads/${fits}/assign`, {
        pickupLocationId: ids.depot,
        dropoffLocationId: ids.yard,
      })
      .expect(201);
    expect((await carrier.get(`/trips/${ids.trip}`)).body.data.availableWeightKg).toBe(4200);
    await carrier.delete(`/trips/${ids.trip}/loads/${fits}`).expect(204);
    expect((await carrier.get(`/trips/${ids.trip}`)).body.data.availableWeightKg).toBe(4500);
    await carrier.patch(`/trips/${ids.trip}`, { maxWeightKg: 7000 }).expect(409);
  });

  it('cancelling a booking releases trip capacity and reopens the postings', async () => {
    const load = (
      await shipper.post('/loads', { description: 'Second load', weightKg: 2000 }).expect(201)
    ).body.data.id;
    const posting = await shipper
      .post('/marketplace/loads', {
        loadId: load,
        pickupLocationId: ids.warehouse,
        deliveryLocationId: ids.dc,
        pickupFrom: hoursFromNow(19),
      })
      .expect(201);
    const offer = await carrier
      .post('/marketplace/offers', {
        loadPostingId: posting.body.data.id,
        vehiclePostingId: ids.vehiclePosting,
        amount: 5000,
      })
      .expect(201);
    const booking = await shipper
      .post(`/marketplace/offers/${offer.body.data.id}/accept`)
      .expect(200);
    expect((await carrier.get(`/trips/${ids.trip}`)).body.data.availableWeightKg).toBe(2500);
    expect(
      (await carrier.get(`/marketplace/vehicles/${ids.vehiclePosting}`)).body.data
        .availableWeightKg,
    ).toBe(2500);

    const cancelled = await carrier
      .post(`/marketplace/bookings/${booking.body.data.id}/cancel`, { reason: 'Truck issue' })
      .expect(200);
    expect(cancelled.body.data).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Truck issue',
    });
    await carrier.post(`/marketplace/bookings/${booking.body.data.id}/cancel`, {}).expect(409);
    expect((await carrier.get(`/trips/${ids.trip}`)).body.data.availableWeightKg).toBe(4500);
    expect(
      (await carrier.get(`/marketplace/vehicles/${ids.vehiclePosting}`)).body.data
        .availableWeightKg,
    ).toBe(4500);
    expect((await shipper.get(`/marketplace/loads/${posting.body.data.id}`)).body.data.status).toBe(
      'OPEN',
    );
    expect((await shipper.get(`/loads/${load}`)).body.data.status).toBe('PENDING');
    await shipper.post(`/marketplace/loads/${posting.body.data.id}/cancel`).expect(200);
  });

  it('dispatches the trip; the driver starts it and streams GPS that shipper and carrier track live', async () => {
    await driver.post(`/trips/${ids.trip}/dispatch`).expect(403);
    const dispatched = await carrier.post(`/trips/${ids.trip}/dispatch`).expect(200);
    expect(dispatched.body.data.status).toBe('DISPATCHED');
    expect((await carrier.get(`/vehicles/${ids.vehicle}`)).body.data.status).toBe('IN_USE');
    await eventually(async () =>
      (await driver.get('/notifications')).body.data.find(
        (n: { type: string }) => n.type === 'TRIP_DISPATCHED',
      ),
    );

    const shipperToken = (shipper as unknown as { token: string }).token;
    const shipperSocket = await connect(shipperToken);
    const ack = await shipperSocket.emitWithAck('trip.subscribe', { tripId: ids.trip });
    expect(ack).toEqual({ ok: true, tripId: ids.trip });
    const rivalSocket = await connect((rival as unknown as { token: string }).token);
    expect(await rivalSocket.emitWithAck('trip.subscribe', { tripId: ids.trip })).toMatchObject({
      ok: false,
    });

    const statusEvent = new Promise((resolve) =>
      shipperSocket.once('trip.status.updated', resolve),
    );
    await driver.post(`/trips/${ids.trip}/start`).expect(200);
    expect(await statusEvent).toMatchObject({ tripId: ids.trip, status: 'IN_PROGRESS' });
    expect((await carrier.get(`/marketplace/bookings/${ids.booking}`)).body.data.status).toBe(
      'IN_PROGRESS',
    );

    const locationEvent = new Promise<Record<string, unknown>>((resolve) =>
      shipperSocket.once('vehicle.location.updated', resolve),
    );
    const etaEvent = new Promise<Record<string, unknown>>((resolve) =>
      shipperSocket.once('trip.eta.updated', resolve),
    );
    const first = await driver
      .post('/tracking/location', {
        vehicleId: ids.vehicle,
        latitude: 14.65,
        longitude: 120.98,
        speedKph: 45,
        heading: 90,
        recordedAt: new Date().toISOString(),
      })
      .expect(202);
    expect(first.body.data).toMatchObject({ accepted: true, persisted: true, live: true });
    expect(first.body.data.position.tripId).toBe(ids.trip);
    expect(await locationEvent).toMatchObject({ tripId: ids.trip, latitude: 14.65 });
    expect(await etaEvent).toMatchObject({
      tripId: ids.trip,
      estimatedArrivalAt: expect.any(String),
    });

    const noise = await driver
      .post('/tracking/location', {
        vehicleId: ids.vehicle,
        latitude: 14.65001,
        longitude: 120.98001,
        recordedAt: new Date(Date.now() + 5_000).toISOString(),
      })
      .expect(202);
    expect(noise.body.data).toMatchObject({ persisted: false, live: true });

    const current = (await shipper.get(`/tracking/trips/${ids.trip}/current`).expect(200)).body
      .data;
    expect(current.position.latitude).toBeCloseTo(14.65001, 5);
    expect(current.position).not.toHaveProperty('vehicleId');
    expect(current.estimatedArrivalAt).toBeTruthy();

    const fleet = (await carrier.get('/tracking/fleet/current').expect(200)).body.data;
    expect(fleet[0]).toMatchObject({
      vehicleId: ids.vehicle,
      vehicle: { plateNumber: 'ABC-1234' },
    });
    const history = await carrier.get(`/tracking/trips/${ids.trip}/history`).expect(200);
    expect(history.body.meta.total).toBe(1);

    const otherVehicle = (
      await carrier
        .post('/vehicles', { plateNumber: 'OTH-0001', vehicleType: 'VAN', maxWeightKg: 800 })
        .expect(201)
    ).body.data.id;
    await driver
      .post('/tracking/location', { vehicleId: otherVehicle, latitude: 14.6, longitude: 120.9 })
      .expect(403);
    await rival.get(`/tracking/trips/${ids.trip}/current`).expect(404);
  });

  it('completes pickup and dropoff stops in order and propagates statuses', async () => {
    await driver.post(`/trips/${ids.trip}/stops/${ids.dropoffStop}/arrive`).expect(409);
    await driver.post(`/trips/${ids.trip}/stops/${ids.pickupStop}/depart`).expect(409);
    await driver.post(`/trips/${ids.trip}/stops/${ids.pickupStop}/arrive`).expect(200);
    await driver.post(`/trips/${ids.trip}/stops/${ids.pickupStop}/depart`).expect(200);
    expect((await shipper.get(`/loads/${ids.load}`)).body.data.status).toBe('IN_TRANSIT');
    expect((await shipper.get(`/shipments/${ids.shipment}`)).body.data.status).toBe('IN_TRANSIT');
    await eventually(
      async () => (await shipper.get(`/orders/${ids.order}`)).body.data.status === 'IN_TRANSIT',
    );

    await carrier.post(`/trips/${ids.trip}/complete`).expect(409);
    await driver.post(`/trips/${ids.trip}/stops/${ids.dropoffStop}/arrive`).expect(200);
    await driver.post(`/trips/${ids.trip}/stops/${ids.dropoffStop}/depart`).expect(200);
    expect((await shipper.get(`/loads/${ids.load}`)).body.data.status).toBe('DELIVERED');
    expect((await shipper.get(`/shipments/${ids.shipment}`)).body.data.status).toBe('DELIVERED');
    await eventually(
      async () => (await shipper.get(`/orders/${ids.order}`)).body.data.status === 'COMPLETED',
    );
    await eventually(async () =>
      (await shipper.get('/notifications')).body.data.find(
        (n: { type: string }) => n.type === 'DELIVERY_COMPLETED',
      ),
    );
  });

  it('completes the trip, completes the booking and finalizes the platform commission', async () => {
    const done = await driver.post(`/trips/${ids.trip}/complete`).expect(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.actualArrivalAt).toBeTruthy();
    await carrier.post(`/trips/${ids.trip}/cancel`).expect(409);
    expect((await carrier.get(`/vehicles/${ids.vehicle}`)).body.data.status).toBe('AVAILABLE');

    const booking = (await carrier.get(`/marketplace/bookings/${ids.booking}`).expect(200)).body
      .data;
    expect(booking).toMatchObject({
      status: 'COMPLETED',
      platformCommissionAmount: 750,
      carrierNetAmount: 14250,
    });
    expect(booking.completedAt).toBeTruthy();

    const summary = (await carrier.get('/billing/summary').expect(200)).body.data;
    expect(summary.asCarrier).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'COMPLETED',
          bookings: 1,
          grossAmount: 15000,
          platformCommissionAmount: 750,
          carrierNetAmount: 14250,
        }),
      ]),
    );
    const shipperSummary = (await shipper.get('/billing/summary').expect(200)).body.data;
    expect(shipperSummary.asShipper[0]).not.toHaveProperty('platformCommissionAmount');
  });

  it('shares proof of delivery on the booking and validates uploads', async () => {
    const upload = await carrier
      .upload(
        '/documents',
        { entityType: 'BOOKING', entityId: ids.booking, type: 'PROOF_OF_DELIVERY' },
        { buffer: PNG_BYTES, name: 'pod.png', type: 'image/png' },
      )
      .expect(201);
    expect(upload.body.data).not.toHaveProperty('storageKey');
    const docs = await shipper
      .get(`/documents?entityType=BOOKING&entityId=${ids.booking}`)
      .expect(200);
    expect(docs.body.data.map((d: { id: string }) => d.id)).toContain(upload.body.data.id);
    const file = await shipper.get(`/documents/${upload.body.data.id}/download`).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    await shipper.delete(`/documents/${upload.body.data.id}`).expect(403);
    await rival.get(`/documents/${upload.body.data.id}`).expect(404);

    const spoofed = await carrier
      .upload(
        '/documents',
        { entityType: 'TRIP', entityId: ids.trip, type: 'OTHER' },
        { buffer: Buffer.from('not really a pdf'), name: 'x.pdf', type: 'application/pdf' },
      )
      .expect(415);
    expect(spoofed.body.code).toBe('FILE_TYPE_MISMATCH');
    await carrier
      .upload(
        '/documents',
        { entityType: 'TRIP', entityId: ids.trip, type: 'OTHER' },
        { buffer: Buffer.from('hello'), name: 'x.txt', type: 'text/plain' },
      )
      .expect(415);
  });

  it('records an immutable audit trail of the workflow', async () => {
    const tripAudit = (
      await carrier.get(`/audit-logs?entityType=Trip&entityId=${ids.trip}&limit=100`).expect(200)
    ).body.data.map((a: { action: string }) => a.action);
    expect(tripAudit).toEqual(
      expect.arrayContaining([
        'trip.created',
        'trip.dispatch',
        'trip.start',
        'trip.stop_arrive',
        'trip.stop_depart',
        'trip.complete',
      ]),
    );
    const actions = async (client: Client) =>
      (await client.get('/audit-logs?limit=100').expect(200)).body.data.map(
        (a: { action: string }) => a.action,
      );
    const [shipperAudit, carrierAudit] = await Promise.all([actions(shipper), actions(carrier)]);
    expect(shipperAudit).toEqual(
      expect.arrayContaining(['booking.created', 'order.created', 'marketplace.load_posted']),
    );
    expect(carrierAudit).toEqual(
      expect.arrayContaining(['booking.created', 'marketplace.vehicle_posted', 'offer.created']),
    );
    expect([...shipperAudit, ...carrierAudit]).toContain('offer.accepted');
    const carrierBooking = (
      await carrier
        .get(`/audit-logs?entityType=MarketplaceBooking&entityId=${ids.booking}`)
        .expect(200)
    ).body.data;
    expect(carrierBooking.map((a: { action: string }) => a.action)).toContain('booking.completed');
    const login = (await carrier.get('/audit-logs?action=auth.register').expect(200)).body.data;
    expect(JSON.stringify(login)).not.toMatch(/password|accessToken|refreshToken/i);
    expect(carrierOrgId).not.toBe(shipperOrgId);
  });
});
