/* eslint-disable no-console */
// Exercises the ops commands end to end on the demo tenant (in memory, no database) and
// verifies that related records stay consistent. Run with `npm run check:flows`.
import { LUCENA_WAREHOUSE } from '../src/ops/domain/data/areas';
import {
  checkRequest,
  findShipperRequest,
  getListingViews,
  requestStatus,
} from '../src/ops/domain/lib/backhaul-marketplace';
import { fmtTimeWindow } from '../src/ops/domain/lib/format';
import {
  capacityShareMessage,
  getBoardMatches,
  getCapacityViews,
  loadShareMessage,
  loadStatus,
} from '../src/ops/domain/lib/load-board';
import {
  getCustomerStats,
  getInvoices,
  getTripMetricsMap,
  invoiceIdForJob,
  tripWarnings,
  unassignedJobs,
} from '../src/ops/domain/lib/logistics';
import type { OpsData } from '../src/ops/domain/types';
import { anchoredClock } from '../src/ops/engine/clock';
import type { OpsCommandName } from '../src/ops/engine/commands';
import { OpsCommandError } from '../src/ops/engine/errors';
import {
  runCommand,
  withTenant,
  type CommandArgs,
  type CommandResult,
} from '../src/ops/engine/run';
import { buildDemoTenant, DEMO_NOW } from '../src/ops/seed';

const tenant = buildDemoTenant();
const LIFETIME_BASELINE = tenant.profile.lifetimeBaseline;
const clock = anchoredClock(DEMO_NOW, 0);
let data: OpsData = tenant.data;
const ctx = { profile: tenant.profile, clock, actor: 'Noel Pascual', role: 'dispatcher' as const };
withTenant(tenant.profile, clock.now(), () => undefined);

function run<N extends OpsCommandName>(name: N, ...args: CommandArgs<N>): CommandResult<N> {
  const r = runCommand(data, ctx, name, args);
  data = r.data;
  return r.result;
}
/** The rule code a command was refused with (undefined when it ran). */
function refused<N extends OpsCommandName>(name: N, ...args: CommandArgs<N>): string | undefined {
  try {
    run(name, ...args);
    return undefined;
  } catch (e) {
    if (e instanceof OpsCommandError) return e.code;
    throw e;
  }
}

/** Data + commands, shaped like the app store so the checks read the same as the frontend's. */
const s = () => ({
  ...data,
  createJob: (...a: CommandArgs<'createJob'>) => run('createJob', ...a),
  assignJobToTrip: (...a: CommandArgs<'assignJobToTrip'>) => run('assignJobToTrip', ...a),
  markArrived: (...a: CommandArgs<'markArrived'>) => run('markArrived', ...a),
  markDelivered: (...a: CommandArgs<'markDelivered'>) => run('markDelivered', ...a),
  recordPayment: (...a: CommandArgs<'recordPayment'>) => run('recordPayment', ...a),
  convertQuoteToJob: (...a: CommandArgs<'convertQuoteToJob'>) => run('convertQuoteToJob', ...a),
  createTrip: (...a: CommandArgs<'createTrip'>) => run('createTrip', ...a),
  cancelJob: (...a: CommandArgs<'cancelJob'>) => run('cancelJob', ...a),
  addFuelLog: (...a: CommandArgs<'addFuelLog'>) => run('addFuelLog', ...a),
  bookBoardLoad: (...a: CommandArgs<'bookBoardLoad'>) => run('bookBoardLoad', ...a),
  reserveOnPartnerTruck: (...a: CommandArgs<'reserveOnPartnerTruck'>) =>
    run('reserveOnPartnerTruck', ...a),
  setBoardLoadStatus: (...a: CommandArgs<'setBoardLoadStatus'>) => run('setBoardLoadStatus', ...a),
  postCapacity: (...a: CommandArgs<'postCapacity'>) => run('postCapacity', ...a),
  confirmBackhaulRequest: (...a: CommandArgs<'confirmBackhaulRequest'>) =>
    run('confirmBackhaulRequest', ...a),
  requestBackhaulSpace: (...a: CommandArgs<'requestBackhaulSpace'>) =>
    run('requestBackhaulSpace', ...a),
  declineBackhaulRequest: (...a: CommandArgs<'declineBackhaulRequest'>) =>
    run('declineBackhaulRequest', ...a),
  publishBackhaulListing: (...a: CommandArgs<'publishBackhaulListing'>) =>
    run('publishBackhaulListing', ...a),
  setBackhaulListingStatus: (...a: CommandArgs<'setBackhaulListingStatus'>) =>
    run('setBackhaulListingStatus', ...a),
});
const metrics = () =>
  getTripMetricsMap(data.trips, data.jobs, data.loads, data.deliveries, data.expenses);
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else console.log('ok:', msg);
};

const shipperFields = ({
  id: _id,
  quotedFreight: _q,
  status: _s,
  createdAt: _c,
  respondedAt: _r,
  respondedBy: _b,
  declineReason: _d,
  jobId: _j,
  ...rest
}: OpsData['backhaulRequests'][number]) => rest;

// 1. Book a job for tomorrow and put it on Truck 02's trip
const seaside = s().customers.find((c) => c.id === 'CUS-022')!;
const jobId = s().createJob({
  customerId: seaside.id,
  source: 'Messenger',
  leg: 'outbound',
  pickup: LUCENA_WAREHOUSE,
  dropoff: { name: seaside.name, areaId: 'bacoor', address: seaside.addresses[0].line1 },
  consignee: { name: 'Marco Villareal', phone: '0917 921 4406' },
  cargo: [
    {
      cargoDescription: 'Sugpo (tiger prawn), iced',
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
});
assert(jobId === 'JOB-260926-021', `job numbered in tomorrow's series (${jobId})`);
assert(
  unassignedJobs(s().jobs, '2026-09-26').some((j) => j.id === jobId),
  'new job is unassigned on the dispatch board',
);
const before = metrics().get('TRIP-260926-02')!.outboundKg;
s().assignJobToTrip(jobId, 'TRIP-260926-02');
const m2 = metrics().get('TRIP-260926-02')!;
assert(
  m2.outboundKg === before + 200 && m2.jobs.some((j) => j.id === jobId),
  'trip load increased and lists the job',
);
assert(
  s().deliveries.some((d) => d.jobId === jobId && d.tripId === 'TRIP-260926-02'),
  'delivery record created on the trip',
);
assert(
  s()
    .trips.find((t) => t.id === 'TRIP-260926-02')!
    .stops.some((st) => st.customerId === 'CUS-022'),
  'trip stops include Seaside Grill',
);
assert(s().jobs.find((j) => j.id === jobId)!.status === 'Assigned', 'job status is Assigned');

// 2. Unassign → delivery and stop removed
s().assignJobToTrip(jobId, null);
assert(!s().deliveries.some((d) => d.jobId === jobId), 'unassigning removes the delivery');
assert(
  !s()
    .trips.find((t) => t.id === 'TRIP-260926-02')!
    .stops.some((st) => st.customerId === 'CUS-022'),
  'unassigning removes the stop',
);

// 3. Deliver a live Truck 01 drop with COD cash → freight invoice paid
const dl = s().deliveries.find((d) => d.jobId === 'JOB-260925-003')!;
s().markArrived(dl.id);
s().markDelivered(
  dl.id,
  { receivedBy: 'Lorna Pascual', signatureCaptured: true, photoCount: 2 },
  4950,
);
const inv = getInvoices(s().jobs, s().payments).find(
  (i) => i.id === invoiceIdForJob('JOB-260925-003'),
)!;
assert(
  inv && inv.balance === 0 && inv.paid === 4950,
  'COD delivery creates INV-260925-003 fully paid',
);
assert(
  s().jobs.find((j) => j.id === 'JOB-260925-003')!.status === 'Delivered',
  'job marked Delivered',
);
assert(
  s()
    .deliveries.find((d) => d.id === dl.id)!
    .pod?.receiptNo.startsWith('DR-'),
  'POD has a DR number',
);

// 4. Partial payment reduces customer outstanding
const stats = () =>
  getCustomerStats(
    s().customers,
    s().jobs,
    getInvoices(s().jobs, s().payments),
    LIFETIME_BASELINE,
  ).get('CUS-002')!.outstanding;
const beforeOut = stats();
const rjm = getInvoices(s().jobs, s().payments).find(
  (i) => i.customerId === 'CUS-002' && i.balance > 0,
)!;
s().recordPayment({
  invoiceId: rjm.id,
  jobId: rjm.jobId,
  customerId: 'CUS-002',
  amount: 3000,
  method: 'GCash',
  reference: 'GCash Ref •••• 1234',
});
assert(
  beforeOut - stats() === 3000,
  `RJM outstanding reduced by ₱3,000 (${beforeOut} → ${stats()})`,
);

// 5. Backhaul opportunity: add JOB-260925-021 to Truck 01's return leg while in transit
s().assignJobToTrip('JOB-260925-021', 'TRIP-260925-01');
const t1 = metrics().get('TRIP-260925-01')!;
assert(
  t1.returnKg === 5300 && t1.returnKg <= t1.capacityKg,
  `Truck 01 return load now ${t1.returnKg} kg`,
);

// 6. Outbound cargo cannot be added to a departed trip
const code6 = refused('assignJobToTrip', 'JOB-260925-019', 'TRIP-260925-01');
assert(
  code6 === 'TRIP_NOT_EDITABLE' && !s().jobs.find((j) => j.id === 'JOB-260925-019')!.tripId,
  'outbound job not added to an in-transit trip',
);

// 7. Accepted quote → job
const fromQuote = s().convertQuoteToJob('QT-260922-001');
assert(
  s().quotes.find((q) => q.id === 'QT-260922-001')!.jobId === fromQuote &&
    s().jobs.some((j) => j.id === fromQuote && j.quoteId === 'QT-260922-001'),
  `accepted quote converted to ${fromQuote}`,
);

// 8. Plan Monday trip on Truck 02 with Ramon → maintenance + driver warnings
const mon = s().createTrip({
  date: '2026-09-28',
  truckId: 'TRK-02',
  driverId: 'DRV-02',
  helperIds: ['HL-03'],
  routeId: 'RT-CAV',
  departure: '2026-09-28T05:00',
});
const trip = s().trips.find((t) => t.id === mon)!;
const warn = tripWarnings(trip, metrics().get(mon), s().trips, s().maintenance, s().documents).map(
  (w) => w.kind,
);
assert(
  mon === 'TRIP-260928-01' && warn.includes('maintenance') && warn.includes('driver'),
  `Monday trip ${mon} flags ${warn.join(', ')}`,
);

// 9. Cancel a job on a planned trip
s().cancelJob('JOB-260926-003', 'Customer postponed');
assert(
  !s().loads.some((l) => l.jobId === 'JOB-260926-003' && l.tripId) &&
    !s().deliveries.some((d) => d.jobId === 'JOB-260926-003'),
  'cancelled job released from its trip',
);

// 10. Fuel log creates a diesel expense on the trip
const before10 = metrics().get('TRIP-260925-01')!.expenseTotal;
s().addFuelLog({
  truckId: 'TRK-01',
  tripId: 'TRIP-260925-01',
  driverId: 'DRV-01',
  date: '2026-09-25T12:00',
  odometerKm: 284700,
  liters: 50,
  pricePerLiter: 63.2,
  station: 'Shell — NLEX Valenzuela',
  areaId: 'valenzuela',
  fullTank: false,
});
assert(
  metrics().get('TRIP-260925-01')!.expenseTotal === before10 + 3160,
  'fuel top-up adds ₱3,160 diesel to the trip',
);

// ─── Load Board ─────────────────────────────────────────────────────────────
const views = () => getCapacityViews(s().boardCapacity, s().trips, metrics(), s().truckingPartners);
const board = () => getBoardMatches(s().boardLoads, views(), s().jobs);
const boardStatus = (id: string) => {
  const l = s().boardLoads.find((x) => x.id === id)!;
  return loadStatus(l, l.jobId ? s().jobs.find((j) => j.id === l.jobId) : undefined);
};
const consignee = { name: 'Alvin Tolentino', phone: '0917 334 8821' };

// 11. Our capacity on the board is derived from the trip (after step 5 added 1,200 kg)
const cap1 = views().get('CAP-260924-001')!;
assert(
  cap1.availableKg === cap1.totalKg - metrics().get('TRIP-260925-01')!.returnKg &&
    cap1.availableKg === 3200,
  `Truck 01 return space = payload − return load (${cap1.availableKg} kg)`,
);

// 12. Rule-based matching
const m1 = board()
  .byLoad.get('FRT-260925-001')!
  .find((m) => m.capacityId === 'CAP-260924-001')!;
assert(
  m1.label === 'Strong Match' && m1.availableAfter === 1200,
  `FRT-260925-001 → Truck 01 is a ${m1.label}, 1,200 kg left after`,
);
const frozen = board().byLoad.get('FRT-260925-004')!;
assert(
  frozen.find((m) => m.capacityId === 'CAP-260924-001')!.label === 'Poor Fit' &&
    frozen[0].capacityId === 'CAP-260925-005' &&
    frozen[0].label === 'Strong Match',
  'reefer load only fits the partner reefer van',
);
assert(
  !board().byLoad.has('FRT-260924-001') && boardStatus('FRT-260924-001') === 'Expired',
  'past-pickup load is Expired and not matched',
);

// 13. Accept match → Logistics Job + Load on the trip → return (backhaul) cargo
const jobsBefore = s().jobs.length;
const loadsBefore = s().loads.length;
const r1 = s().bookBoardLoad({
  loadId: 'FRT-260925-001',
  capacityId: 'CAP-260924-001',
  freightCharge: 9000,
  paymentTerms: 'COD',
  consignee,
})!;
const bj = s().jobs.find((j) => j.id === r1.jobId)!;
assert(
  r1.created &&
    bj.source === 'Load Board' &&
    bj.tripId === 'TRIP-260925-01' &&
    bj.leg === 'return' &&
    bj.status === 'Assigned',
  `FRT-260925-001 became ${r1.jobId} on TRIP-260925-01`,
);
const bl = s().loads.filter((l) => l.jobId === r1.jobId);
assert(
  bl.length === 1 &&
    bl[0].tripId === 'TRIP-260925-01' &&
    bl[0].type === 'Third-Party' &&
    bl[0].weightKg === 2000,
  'one 2,000 kg third-party load on the trip',
);
assert(
  metrics()
    .get('TRIP-260925-01')!
    .returnLoads.some((l) => l.jobId === r1.jobId) &&
    metrics().get('TRIP-260925-01')!.returnKg === 7300,
  "load counted in the trip's return leg (Backhaul)",
);
assert(
  s()
    .trips.find((t) => t.id === 'TRIP-260925-01')!
    .stops.some((st) => st.loaded.includes(bl[0].id)) &&
    s().deliveries.some((d) => d.jobId === r1.jobId),
  'pickup stop and delivery added to the trip',
);
assert(
  views().get('CAP-260924-001')!.availableKg === 1200 && boardStatus('FRT-260925-001') === 'Booked',
  'board shows 1,200 kg left and the load as Booked',
);
const shipper = s().customers.find((c) => c.id === bj.customerId)!;
assert(
  shipper.status === 'new' && shipper.contacts[0].name === 'Alvin Tolentino',
  `shipper saved as new customer ${shipper.id}`,
);

// 14. Repeating the action never duplicates
const r2 = s().bookBoardLoad({
  loadId: 'FRT-260925-001',
  capacityId: 'CAP-260924-001',
  freightCharge: 9000,
  paymentTerms: 'COD',
  consignee,
})!;
assert(
  !r2.created &&
    r2.jobId === r1.jobId &&
    s().jobs.length === jobsBefore + 1 &&
    s().loads.length === loadsBefore + 1,
  'repeat booking creates no duplicate job or load',
);

// 15. Create job without a trip, then add it to Truck 01 later
const r3 = s().bookBoardLoad({
  loadId: 'FRT-260925-006',
  freightCharge: 6000,
  paymentTerms: 'Credit 7 Days',
  consignee: { name: 'Alfredo Maaño', phone: '0918 772 1043' },
})!;
const j3 = s().jobs.find((j) => j.id === r3.jobId)!;
assert(
  j3.customerId === 'CUS-035' &&
    !j3.tripId &&
    unassignedJobs(s().jobs).some((j) => j.id === j3.id) &&
    boardStatus('FRT-260925-006') === 'Reserved',
  `${j3.id} for Quezon Harvest Traders waits on dispatch; post is Reserved`,
);
const r4 = s().bookBoardLoad({
  loadId: 'FRT-260925-006',
  capacityId: 'CAP-260924-001',
  freightCharge: 6000,
  paymentTerms: 'Credit 7 Days',
  consignee: { name: 'Alfredo Maaño', phone: '0918 772 1043' },
})!;
assert(
  !r4.created &&
    s().jobs.find((j) => j.id === r3.jobId)!.tripId === 'TRIP-260925-01' &&
    boardStatus('FRT-260925-006') === 'Booked',
  'existing job moved onto the trip without a new job',
);
assert(
  views().get('CAP-260924-001')!.availableKg === 0 &&
    views().get('CAP-260924-001')!.status === 'Full',
  'Truck 01 return leg now Full on the board',
);

// 16. Partner truck reservation holds and releases space
s().reserveOnPartnerTruck('FRT-260925-004', 'CAP-260925-005');
s().reserveOnPartnerTruck('FRT-260925-004', 'CAP-260925-005');
assert(
  views().get('CAP-260925-005')!.usedKg === 4700 && boardStatus('FRT-260925-004') === 'Reserved',
  'reserving on the reefer uses 2,500 kg once',
);
s().setBoardLoadStatus('FRT-260925-004', 'Looking for Truck');
assert(
  views().get('CAP-260925-005')!.usedKg === 2200 &&
    !s().boardLoads.find((l) => l.id === 'FRT-260925-004')!.capacityId,
  'releasing the reservation gives the space back',
);

// 17. Posting and share messages
const newCap = s().postCapacity({
  fleet: 'internal',
  tripId: 'TRIP-260926-02',
  leg: 'return',
  source: 'Internal',
  contact: { name: 'Noel Pascual', phone: '0919 338 5402' },
  acceptedCargo: [],
});
const nv = views().get(newCap)!;
assert(
  nv.availableKg === nv.totalKg - metrics().get('TRIP-260926-02')!.returnKg,
  `${newCap} reads Truck 02's return space from TRIP-260926-02 (${nv.availableKg} kg)`,
);
const cmsg = capacityShareMessage(views().get('CAP-260925-004')!);
assert(
  cmsg.startsWith('AVAILABLE TRUCK CAPACITY') &&
    cmsg.includes('Available Capacity: 4,200 kg') &&
    cmsg.includes('Departure: Tonight, 9:00 PM'),
  'capacity share message',
);
const lmsg = loadShareMessage(s().boardLoads.find((l) => l.id === 'FRT-260925-010')!);
assert(
  lmsg.startsWith('LOAD AVAILABLE') &&
    lmsg.includes('Weight: 2,000 kg') &&
    lmsg.includes('Noel Pascual') &&
    !lmsg.includes('Rolando'),
  'customer load reposted with our desk as contact',
);

// ─── Backhaul Marketplace (preview) ─────────────────────────────────────────
const legs = () =>
  getListingViews(s().trips, s().backhaulListings, s().backhaulRequests, metrics(), s().jobs);
const req = (id: string) => s().backhaulRequests.find((r) => r.id === id)!;
const reqStatus = (id: string) => {
  const r = req(id);
  return requestStatus(
    r,
    r.jobId ? s().jobs.find((j) => j.id === r.jobId) : undefined,
    legs().get(s().backhaulListings.find((l) => l.id === r.listingId)!.tripId)?.status,
  );
};

// 18. Seeded marketplace booking rides Truck 02 today
const seeded = s().jobs.find((j) => j.id === req('BKR-260925-001').jobId)!;
assert(
  seeded.id === 'JOB-260925-022' &&
    seeded.source === 'Backhaul Marketplace' &&
    seeded.tripId === 'TRIP-260925-02' &&
    legs()
      .get('TRIP-260925-02')!
      .booked.some((b) => b.job.id === seeded.id),
  "BKR-260925-001 is JOB-260925-022 on TRIP-260925-02's return leg",
);

// 19. A full return leg cannot take a marketplace request
assert(
  legs().get('TRIP-260925-01')!.status === 'Full' && legs().get('TRIP-260925-01')!.openKg === 0,
  'Truck 01 listing is Full once the board bookings filled it',
);
const jobsBefore19 = s().jobs.length;
assert(
  refused('confirmBackhaulRequest', {
    requestId: 'BKR-260925-002',
    freightCharge: 7500,
    paymentTerms: 'COD',
  }) === 'NOT_ENOUGH_SPACE' &&
    s().jobs.length === jobsBefore19 &&
    reqStatus('BKR-260925-002') === 'Requested',
  'confirming on a full leg is refused and creates nothing',
);

// 20. Confirm a request → Job + Third-Party Load on the trip's return leg
const leg20 = legs().get('TRIP-260926-01')!;
const cap20 = views().get('CAP-260925-002')!.availableKg;
const customers20 = s().customers.length;
const c20 = s().confirmBackhaulRequest({
  requestId: 'BKR-260925-005',
  freightCharge: 3000,
  paymentTerms: 'COD',
})!;
const mj = s().jobs.find((j) => j.id === c20.jobId)!;
assert(
  c20.created &&
    mj.source === 'Backhaul Marketplace' &&
    mj.leg === 'return' &&
    mj.tripId === 'TRIP-260926-01' &&
    mj.status === 'Assigned',
  `BKR-260925-005 became ${c20.jobId} on TRIP-260926-01`,
);
const ml = s().loads.filter((l) => l.jobId === mj.id);
assert(
  ml.length === 1 &&
    ml[0].type === 'Third-Party' &&
    ml[0].weightKg === 600 &&
    ml[0].tripId === 'TRIP-260926-01',
  'one 600 kg third-party load on the trip',
);
assert(
  s().deliveries.some((d) => d.jobId === mj.id && d.tripId === 'TRIP-260926-01') &&
    s()
      .trips.find((t) => t.id === 'TRIP-260926-01')!
      .stops.some((st) => st.loaded.includes(ml[0].id)),
  'pickup stop and delivery (own waybill) added',
);
const shipper20 = s().customers.find((c) => c.id === mj.customerId)!;
assert(
  s().customers.length === customers20 + 1 &&
    shipper20.leadSource === 'Backhaul Marketplace' &&
    shipper20.status === 'new',
  `shipper saved as new customer ${shipper20.id}`,
);
assert(
  reqStatus('BKR-260925-005') === 'Confirmed' && req('BKR-260925-005').customerId === shipper20.id,
  'request is Confirmed and linked to the customer',
);
assert(
  legs().get('TRIP-260926-01')!.openKg === leg20.openKg - 600 &&
    views().get('CAP-260925-002')!.availableKg === cap20 - 600,
  'open space drops by 600 kg on the listing and on the Load Board',
);

// 21. Repeating the confirmation never duplicates
const again = s().confirmBackhaulRequest({
  requestId: 'BKR-260925-005',
  freightCharge: 3000,
  paymentTerms: 'COD',
})!;
assert(
  !again.created && again.jobId === mj.id && s().jobs.length === jobsBefore19 + 1,
  'repeat confirmation creates no duplicate job',
);

// 22. Shipper requests space: instant quote, over-capacity refused, decline
const rq = s().requestBackhaulSpace({
  listingId: 'BHL-260925-001',
  shipper: {
    businessName: 'Pagbilao Sari-Sari Wholesale',
    contactName: 'Ditas Mercado',
    phone: '0917 000 4412',
  },
  pickup: { name: 'Valenzuela City', areaId: 'valenzuela' },
  dropoff: {
    name: 'Pagbilao Sari-Sari Wholesale',
    areaId: 'pagbilao',
    address: 'Brgy. Poblacion, Pagbilao',
  },
  cargoDescription: 'Garlic',
  cargoCategory: 'Produce',
  quantity: 40,
  unit: 'sack',
  weightKg: 800,
  readyAt: '2026-09-26T09:30',
})!;
assert(
  !!rq &&
    req(rq).quotedFreight === 4000 &&
    reqStatus(rq) === 'Requested' &&
    s().notifications[0].href.includes(rq),
  `${rq} requested with a ₱4,000 instant quote and a dispatch notification`,
);
assert(
  refused('requestBackhaulSpace', { ...shipperFields(req(rq)), weightKg: 9000 }) ===
    'NOT_ENOUGH_SPACE',
  'request bigger than the open space is refused',
);
s().declineBackhaulRequest(rq, 'Truck leaves Valenzuela before your cargo is ready');
assert(
  reqStatus(rq) === 'Declined' &&
    refused('confirmBackhaulRequest', {
      requestId: rq,
      freightCharge: 4000,
      paymentTerms: 'COD',
    }) === 'REQUEST_CLOSED',
  'declined request cannot be confirmed',
);

// 23. Publishing is one listing per return leg; pausing stops new requests
const bhl = s().publishBackhaulListing({
  tripId: 'TRIP-260926-02',
  ratePerKg: 5,
  minimumCharge: 1500,
  acceptedCargo: [],
})!;
const listingsCount = s().backhaulListings.length;
assert(
  s().publishBackhaulListing({
    tripId: 'TRIP-260926-02',
    ratePerKg: 5.5,
    minimumCharge: 1500,
    acceptedCargo: [],
  }) === bhl &&
    s().backhaulListings.length === listingsCount &&
    s().backhaulListings.find((l) => l.id === bhl)!.ratePerKg === 5.5,
  `${bhl}: re-publishing updates terms, no second listing`,
);
s().setBackhaulListingStatus(bhl, 'Paused');
assert(
  legs().get('TRIP-260926-02')!.status === 'Paused' &&
    refused('requestBackhaulSpace', {
      ...shipperFields(req(rq)),
      listingId: bhl,
      pickup: { name: 'Dasmariñas', areaId: 'dasmarinas' },
    }) === 'LISTING_NOT_OPEN',
  'paused listing takes no new requests',
);

// 24. Cancelling the job gives the space back and the request follows the job
s().cancelJob(mj.id, 'Shipper postponed');
assert(
  reqStatus('BKR-260925-005') === 'Cancelled' &&
    legs().get('TRIP-260926-01')!.openKg === leg20.openKg,
  'cancelled marketplace job frees the return space',
);

// 25. Public Return trips page: shippers find their request by number + mobile, and see time windows
const rqs = s().backhaulRequests;
assert(
  findShipperRequest(rqs, 'bkr-260925-002', '0917-663-2108')?.id === 'BKR-260925-002' &&
    findShipperRequest(rqs, 'BKR-260925-002', '+63 917 663 2108')?.id === 'BKR-260925-002',
  'request found by number and mobile in any format',
);
assert(
  findShipperRequest(rqs, 'BKR-260925-002', '0917 000 0000') === undefined &&
    findShipperRequest(rqs, 'BKR-260925-003', '0917 663 2108') === undefined,
  "wrong mobile or another shipper's number finds nothing",
);
assert(
  fmtTimeWindow('2026-09-25T13:05') === '1–3 PM' &&
    fmtTimeWindow('2026-09-25T11:40') === '11 AM–1 PM',
  'truck times shown to shippers as two-hour windows',
);
const timing = (shipper: boolean) =>
  checkRequest(req(rq), legs().get('TRIP-260926-01')!, { shipper }).checks.find(
    (c) => c.rule === 'timing',
  )!.text;
assert(
  !timing(true).includes('~') && timing(true).includes('–') && timing(false).includes('~'),
  'shipper fit checks hide the exact pass time; dispatch still sees it',
);
