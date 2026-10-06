/* eslint-disable no-console */
// Prints volume, utilization, profitability and AR stats for the demo tenant and verifies key
// cross-entity relationships. Run with `npm run check:seed`.
import { agingBucket } from '../src/ops/domain/lib/calc';
import {
  currentOdometer,
  getInvoices,
  getTripMetricsMap,
  maintenanceOutlook,
} from '../src/ops/domain/lib/logistics';
import { withTenant } from '../src/ops/engine/run';
import { buildDemoTenant, DEMO_NOW } from '../src/ops/seed';

const { profile, data } = buildDemoTenant();
withTenant(profile, DEMO_NOW, () => undefined);
const { jobs, loads, trips, deliveries, quotes, payments, expenses, fuelLogs, maintenance } = data;
let failures = 0;
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
};

console.log({
  jobs: jobs.length,
  loads: loads.length,
  trips: trips.length,
  deliveries: deliveries.length,
  quotes: quotes.length,
  payments: payments.length,
  expenses: expenses.length,
  fuelLogs: fuelLogs.length,
  maintenance: maintenance.length,
});
console.log('trading', {
  orders: data.orders.length,
  pos: data.purchaseOrders.length,
  salesPayments: data.salesPayments.length,
  inventory: data.inventory.length,
});

// Relationships
const jobIds = new Set(jobs.map((j) => j.id));
const tripIds = new Set(trips.map((t) => t.id));
const loadIds = new Set(loads.map((l) => l.id));
assert(jobIds.size === jobs.length, 'job ids unique');
assert(loadIds.size === loads.length, 'load ids unique');
assert(new Set(deliveries.map((d) => d.id)).size === deliveries.length, 'delivery ids unique');
for (const l of loads) {
  if (l.jobId) assert(jobIds.has(l.jobId), `load ${l.id} job exists`);
  if (l.tripId) assert(tripIds.has(l.tripId), `load ${l.id} trip exists`);
}
for (const j of jobs) {
  const jl = loads.filter((l) => l.jobId === j.id);
  assert(jl.length > 0, `job ${j.id} has loads`);
  if (j.tripId)
    assert(
      jl.every((l) => l.tripId === j.tripId || l.status === 'Cancelled'),
      `job ${j.id} loads ride ${j.tripId}`,
    );
  assert(
    Math.abs(jl.reduce((s, l) => s + l.weightKg, 0) - j.weightKg) < 1,
    `job ${j.id} weight = sum of loads`,
  );
}
for (const d of deliveries) {
  const job = jobs.find((j) => j.id === d.jobId);
  assert(
    (job && job.tripId === d.tripId) || d.status === 'Returned',
    `delivery ${d.id} job on same trip`,
  );
  const trip = trips.find((t) => t.id === d.tripId)!;
  assert(
    trip.stops.some((s) => s.unloaded.some((id) => d.loadIds.includes(id))),
    `delivery ${d.id} has a drop stop`,
  );
}
for (const t of trips) {
  for (const s of t.stops)
    for (const id of [...s.loaded, ...s.unloaded])
      assert(loadIds.has(id), `stop ${s.id} load ${id} exists`);
  const onTrip = loads.filter((l) => l.tripId === t.id && l.status !== 'Cancelled');
  for (const l of onTrip)
    assert(
      t.stops.some((s) => s.unloaded.includes(l.id)),
      `load ${l.id} unloaded somewhere on ${t.id}`,
    );
}
for (const p of payments) assert(jobIds.has(p.jobId), `payment ${p.id} job exists`);
for (const f of fuelLogs)
  assert(
    expenses.some((e) => e.fuelLogId === f.id && e.amount === f.totalCost),
    `fuel ${f.id} has diesel expense`,
  );

// Utilization & profitability
const metrics = getTripMetricsMap(trips, jobs, loads, deliveries, expenses);
const rows = trips.slice(-8).map((t) => {
  const m = metrics.get(t.id)!;
  return {
    id: t.id,
    route: t.routeId,
    status: t.status,
    stops: t.stops.length,
    out: `${Math.round(m.outUtil * 100)}%`,
    ret: `${Math.round(m.retUtil * 100)}%`,
    revenue: m.revenue,
    cost: m.expenseTotal,
    est: m.estimatedDiesel,
    contrib: m.contribution,
  };
});
console.table(rows);
const done = trips.filter((t) => t.status === 'Completed').map((t) => metrics.get(t.id)!);
const avg = (f: (m: (typeof done)[number]) => number) =>
  Math.round(done.reduce((s, m) => s + f(m), 0) / done.length);
console.log('completed trips avg', {
  out: avg((m) => m.outUtil * 100) + '%',
  ret: avg((m) => m.retUtil * 100) + '%',
  revenue: avg((m) => m.revenue),
  expenses: avg((m) => m.expenseTotal),
  contribution: avg((m) => m.contribution),
});

// Receivables
const inv = getInvoices(jobs, payments);
const buckets: Record<string, number> = {};
for (const i of inv)
  if (i.balance > 0)
    buckets[agingBucket(i.daysOverdue)] = (buckets[agingBucket(i.daysOverdue)] ?? 0) + i.balance;
console.log(
  'AR outstanding',
  inv.reduce((s, i) => s + i.balance, 0),
  buckets,
);

// Fleet
for (const truck of profile.trucks) {
  const odo = currentOdometer(truck, trips, fuelLogs);
  const o = maintenanceOutlook(truck.id, maintenance, odo);
  console.log(truck.code, {
    odo,
    nextPms: o.nextPms && { dueKm: o.nextPms.dueKm, kmLeft: o.nextPms.kmLeft },
    overdue: o.overdue.map((m) => m.id),
    upcoming: o.upcoming.map((m) => m.id),
  });
}
const t01 = trips.find((t) => t.id === 'TRIP-260925-01')!;
console.log(
  t01.stops
    .map(
      (s) =>
        `${s.seq}. ${s.type} · ${s.location.name} · ${s.status} · ${s.plannedArrival.slice(11)}`,
    )
    .join('\n'),
);
console.log(
  'job statuses',
  jobs.reduce<Record<string, number>>((m, j) => ((m[j.status] = (m[j.status] ?? 0) + 1), m), {}),
);
if (failures) {
  console.error(`${failures} relationship check(s) failed`);
  process.exitCode = 1;
} else console.log('All relationship checks passed.');
