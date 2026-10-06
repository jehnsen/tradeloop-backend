import { DataSource } from 'typeorm';
import { OpsStore } from '../src/ops/persistence/ops-store';
import { buildDemoTenant } from '../src/ops/seed';
import { Client, createTestApp, login, PASSWORD, registerOrg, TestApp, uniqueEmail } from './utils';

const job = {
  customerId: 'CUS-022',
  source: 'Messenger',
  leg: 'outbound',
  pickup: { name: 'Lucena Main Warehouse', areaId: 'lucena' },
  dropoff: { name: 'Seaside Grill Bacoor', areaId: 'bacoor' },
  consignee: { name: 'Marco Villareal', phone: '0917 921 4406' },
  cargo: [
    {
      cargoDescription: 'Sugpo, iced',
      cargoCategory: 'Seafood',
      quantity: 8,
      unit: 'styro box',
      weightKg: 200,
    },
  ],
  truckRequirement: 'Insulated van, iced cargo',
  pickupAt: '2026-09-26T02:30',
  requiredBy: '2026-09-26T13:00',
  freightCharge: 2000,
  additionalCharges: [],
  paymentTerms: 'COD',
  status: 'Awaiting Dispatch',
};

/** TradeLoop operations: snapshot, workflow commands, business rules and the public pages. */
describe('Operations API (e2e)', () => {
  let t: TestApp;
  let owner: Client;
  let orgId: string;
  let orgCode: string;
  let ds: DataSource;

  beforeAll(async () => {
    t = await createTestApp();
    const reg = await registerOrg(t.app, 'LOGISTICS_PROVIDER', 'Ops Demo Logistics');
    owner = reg.client;
    orgId = reg.organizationId;
    ds = t.app.get(DataSource);
    await ds.query(`UPDATE organizations SET metadata = '{"opsDemo": true}' WHERE id = $1`, [
      orgId,
    ]);
    [{ code: orgCode }] = await ds.query(`SELECT code FROM organizations WHERE id = $1`, [orgId]);
    const demo = buildDemoTenant();
    await ds.transaction((m) => new OpsStore().replaceAll(m, orgId, demo.profile, demo.data, 1));
  });
  afterAll(() => t.close());

  it('serves the whole data set with the viewer and profile', async () => {
    const res = await owner.get('/ops/snapshot').expect(200);
    const snap = res.body.data;
    expect(snap.viewer).toMatchObject({
      role: 'owner',
      canViewAs: true,
      organization: { demo: true },
    });
    expect(snap.data.jobs).toHaveLength(373);
    expect(snap.profile.trucks.map((x: { id: string }) => x.id)).toEqual(['TRK-01', 'TRK-02']);
    expect(snap.now).toBe('2026-09-25T07:48');
  });

  it('runs a command and answers with the records it changed', async () => {
    const created = await owner.post('/ops/jobs', job).expect(201);
    const jobId = created.body.data.result;
    expect(jobId).toBe('JOB-260926-021');
    expect(created.body.data.changes.jobs.order[0]).toBe(jobId);
    const assigned = await owner
      .post(`/ops/jobs/${jobId}/assign`, { tripId: 'TRIP-260926-02' })
      .expect(200);
    expect(assigned.body.data.version).toBe(created.body.data.version + 1);
    expect(
      assigned.body.data.changes.deliveries.upsert.some(
        (d: { jobId: string }) => d.jobId === jobId,
      ),
    ).toBe(true);
    const [row] = await ds.query(
      `SELECT trip_id, status FROM ops.jobs WHERE organization_id = $1 AND id = $2`,
      [orgId, jobId],
    );
    expect(row).toEqual({ trip_id: 'TRIP-260926-02', status: 'Assigned' });
    const [first] = await ds.query(
      `SELECT id FROM ops.jobs WHERE organization_id = $1 ORDER BY sort_key LIMIT 1`,
      [orgId],
    );
    expect(first.id).toBe(jobId);
  });

  it('explains refused workflow steps', async () => {
    const res = await owner
      .post('/ops/jobs/JOB-260925-019/assign', { tripId: 'TRIP-260925-01' })
      .expect(409);
    expect(res.body.code).toBe('TRIP_NOT_EDITABLE');
    await owner.post('/ops/deliveries/DLV-000000-000/arrive').expect(404);
  });

  it('validates command input', async () => {
    const res = await owner
      .post('/ops/jobs', { ...job, source: 'Load Board', cargo: [] })
      .expect(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(
      expect.arrayContaining(['source', 'cargo']),
    );
  });

  it('keeps drivers to their own trips and away from money', async () => {
    const email = uniqueEmail('driver');
    await owner
      .post('/organizations/current/memberships', {
        email,
        role: 'DRIVER',
        firstName: 'Joel',
        lastName: 'Mendoza',
        password: PASSWORD,
        subjectRef: 'DRV-01',
      })
      .expect(201);
    const driver = await login(t.app, email);
    const snap = (await driver.get('/ops/snapshot').expect(200)).body.data;
    expect(snap.data.payments).toHaveLength(0);
    expect(new Set(snap.data.trips.map((x: { driverId: string }) => x.driverId))).toEqual(
      new Set(['DRV-01']),
    );
    const theirs = (await owner.get('/ops/snapshot')).body.data.data.deliveries.find(
      (d: { tripId: string; status: string }) =>
        d.tripId === 'TRIP-260925-02' && d.status !== 'Delivered',
    );
    await driver.post(`/ops/deliveries/${theirs.id}/arrive`).expect(403);
    await driver.post('/ops/payments', {}).expect(403);
  });

  it('shows shippers listings without trip, plate or driver details', async () => {
    const res = await new Client(t.app).get(`/public/ops/${orgCode}/return-trips`).expect(200);
    expect(res.body.data.listings.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body.data)).not.toMatch(/TRIP-|NCR \d{4}|DRV-|Mendoza/);
    const listing = res.body.data.listings[0];
    const request = await new Client(t.app)
      .post(`/public/ops/${orgCode}/return-trips/requests`, {
        listingId: listing.listingId,
        shipper: {
          businessName: 'Pagbilao Sari-Sari',
          contactName: 'Ditas Mercado',
          phone: '0917 000 4412',
        },
        pickup: { name: 'Pickup', areaId: listing.pickupAreas[0] },
        dropoff: { name: 'Pagbilao Sari-Sari', areaId: 'pagbilao' },
        cargoDescription: 'Garlic',
        cargoCategory: 'Produce',
        quantity: 10,
        unit: 'sack',
        weightKg: 200,
        readyAt: `${listing.date}T08:00`,
      })
      .expect(201);
    const status = await new Client(t.app)
      .get(`/public/ops/${orgCode}/return-trips/requests/${request.body.data.id}?phone=09170004412`)
      .expect(200);
    expect(status.body.data).toMatchObject({ id: request.body.data.id, status: 'Requested' });
    await new Client(t.app)
      .get(`/public/ops/${orgCode}/return-trips/requests/${request.body.data.id}?phone=09171111111`)
      .expect(404);
  });

  it('resets a demo organization to the seed, and only a demo organization', async () => {
    const reset = await owner.post('/ops/demo/reset').expect(200);
    expect(reset.body.data.data.jobs).toHaveLength(373);
    const other = await registerOrg(t.app, 'LOGISTICS_PROVIDER', 'Real Logistics Co');
    await other.client.post('/ops/demo/reset').expect(403);
    const empty = (await other.client.get('/ops/snapshot').expect(200)).body.data;
    expect(empty.data.jobs).toHaveLength(0);
    expect(empty.profile.company.name).toBe('Real Logistics Co');
  });
});
