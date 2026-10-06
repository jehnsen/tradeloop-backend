import { applyOpsChanges } from '../domain/lib/ops-data';
import { buildDemoTenant, DEMO_NOW } from '../seed';
import { anchoredClock } from './clock';
import { OpsCommandError } from './errors';
import { runCommand, withTenant, type RunContext } from './run';

describe('runCommand', () => {
  const demo = buildDemoTenant();
  const ctx = (): RunContext => ({
    profile: demo.profile,
    clock: anchoredClock(DEMO_NOW, 0),
    actor: 'Noel Pascual',
    role: 'dispatcher',
  });

  it('returns a change set that reproduces the new data set on a client copy', () => {
    const run = runCommand(demo.data, ctx(), 'createJob', [
      {
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
      },
    ]);
    expect(run.result).toBe('JOB-260926-021');
    expect(run.changes.jobs?.order?.[0]).toBe('JOB-260926-021');
    expect(Object.keys(run.changes).sort()).toEqual(['jobs', 'loads', 'notifications']);
    const client = applyOpsChanges(demo.data, run.changes);
    expect(client.jobs.map((j) => j.id)).toEqual(run.data.jobs.map((j) => j.id));
    expect(client.loads).toEqual(run.data.loads);
    // The input data set is untouched (records are replaced, never mutated).
    expect(demo.data.jobs.some((j) => j.id === 'JOB-260926-021')).toBe(false);
  });

  it('rejects rule violations with a code and leaves the data alone', () => {
    const before = demo.data.jobs.find((j) => j.id === 'JOB-260925-019');
    expect(() =>
      runCommand(demo.data, ctx(), 'assignJobToTrip', ['JOB-260925-019', 'TRIP-260925-01']),
    ).toThrow(OpsCommandError);
    expect(demo.data.jobs.find((j) => j.id === 'JOB-260925-019')).toBe(before);
  });

  it('refuses commands on records that do not exist', () => {
    expect(() => runCommand(demo.data, ctx(), 'markArrived', ['DLV-000000-000'])).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });

  it('stamps events with the advancing demo clock', () => {
    const clock = anchoredClock(DEMO_NOW, 0);
    runCommand(demo.data, { ...ctx(), clock }, 'moveLead', ['LD-001', 'Contacted']);
    expect(clock.tick).toBe(2);
    expect(clock.now()).toBe('2026-09-25T07:50');
  });

  it('refuses asynchronous work while the tenant registries are set', () => {
    expect(() => withTenant(demo.profile, DEMO_NOW, () => Promise.resolve())).toThrow();
  });
});
