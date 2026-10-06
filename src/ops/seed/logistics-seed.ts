/**
 * TradeLoop logistics demo data.
 *
 * 30 days of trip history (Aug 26 → Sep 24), today's live operations (Fri Sep 25, 07:48),
 * tomorrow's dispatch plan and upcoming bookings. Deterministic and relationally consistent:
 * quotes convert to jobs, jobs carry loads, loads ride trips, trips produce stops, deliveries,
 * expenses and fuel logs, delivered jobs produce invoices and payments settle those invoices.
 */
import type {
  AppNotification,
  CargoCategory,
  Charge,
  Customer,
  CustomerType,
  Delivery,
  Expense,
  ExpenseCategory,
  FreightQuote,
  FuelLog,
  JobSource,
  JobStatus,
  Leg,
  Load,
  LoadStatus,
  LoadType,
  LogisticsJob,
  MaintenanceRecord,
  Payment,
  PaymentMethod,
  Place,
  Trip,
} from '../domain/types';
import { NOW, TODAY, TOMORROW, staffById } from '../domain/data/company';
import {
  INTER_ISLAND_PARTNER,
  LUCENA_WAREHOUSE,
  PLACES,
  placeByName,
  routeById,
  type PlaceKind,
} from '../domain/data/areas';
import { CUSTOMERS, customerById } from './customers';
import { TRUCKS, driverById, truckById } from '../domain/data/fleet';
import { MAINTENANCE } from './fleet-records';
import { cargoByKey, suggestFreight } from '../domain/data/cargo';
import {
  addDaysISO,
  at,
  createRandom,
  pad,
  plusMin,
  roundTo,
  weekdayOf,
  yymmdd,
} from './seed-utils';
import {
  customerPlace,
  deliveryIdForJob,
  getInvoices,
  invoiceIdForJob,
  isBillableJob,
  jobTotal,
  planStops,
  travelMinutes,
} from '../domain/lib/logistics';
import { isCreditTerms, termsDays } from '../domain/lib/calc';

/** Generates the logistics records. Run after the demo tenant profile is applied. */
export function generateLogisticsSeed() {
  const R = createRandom(88_260_925);
  const { rint, rfloat, chance, pick, shuffle } = R;

  const DISPATCHER = 'Noel Pascual';
  const WAREHOUSE_STAFF = 'Bong Esguerra';
  const ACCOUNTING = 'Grace Lontoc';
  const START = '2026-08-26';

  // ─── Output collections ─────────────────────────────────────────────────────
  const jobs: LogisticsJob[] = [];
  const loads: Load[] = [];
  const trips: Trip[] = [];
  const deliveries: Delivery[] = [];
  const expenses: Omit<Expense, 'id'>[] = [];
  const fuelLogs: FuelLog[] = [];
  const rawPayments: Omit<Payment, 'id' | 'receiptNo'>[] = [];
  const quotes: FreightQuote[] = [];

  const jobIndex = new Map<string, LogisticsJob>();
  const ctx = { job: (id: string) => jobIndex.get(id), customer: (id: string) => customerById(id) };

  const seqs = new Map<string, number>();
  function nextId(prefix: string, date: string, width = 3) {
    const key = `${prefix}-${yymmdd(date)}`;
    const n = (seqs.get(key) ?? 0) + 1;
    seqs.set(key, n);
    return `${key}-${pad(n, width)}`;
  }
  function reserveId(prefix: string, date: string, no: string) {
    const key = `${prefix}-${yymmdd(date)}`;
    seqs.set(key, Math.max(seqs.get(key) ?? 0, Number(no)));
    return `${key}-${no}`;
  }
  let drSeq = 4100;
  const nextDr = () => `DR-${pad(++drSeq, 6)}`;

  // ─── Scheduling rules ───────────────────────────────────────────────────────
  const TRUCK_PATTERN: Record<string, Record<number, string>> = {
    'TRK-01': { 1: 'RT-NV', 2: 'RT-MNL', 3: 'RT-NV', 4: 'RT-NCQ', 5: 'RT-NV', 6: 'RT-NV' },
    'TRK-02': { 1: 'RT-CAV', 2: 'RT-LAG', 3: 'RT-BAT', 4: 'RT-SOU', 5: 'RT-CAV', 6: 'RT-SOU' },
  };
  /** Workshop days (see MAINTENANCE): the truck stays in Lucena. */
  const TRUCK_DOWN: Record<string, string[]> = {
    'TRK-01': ['2026-09-01', '2026-09-14'],
    'TRK-02': ['2026-09-08'],
  };
  const HELPERS_BY_TRUCK: Record<string, string[]> = {
    'TRK-01': ['HL-01', 'HL-02'],
    'TRK-02': ['HL-03', 'HL-04'],
  };
  function driverFor(truckId: string, date: string) {
    const wd = weekdayOf(date);
    if (truckId === 'TRK-01') return wd === 2 || wd === 6 ? 'DRV-03' : 'DRV-01';
    return wd === 3 || wd === 6 ? 'DRV-04' : 'DRV-02';
  }
  const tripIdFor = (date: string, truckId: string) =>
    `TRIP-${yymmdd(date)}-${truckId === 'TRK-01' ? '01' : '02'}`;

  // ─── Cargo building blocks ──────────────────────────────────────────────────
  const PREF_CARGO: Record<string, string> = {
    'P-SUG-J': 'sugpo',
    'P-SUG-L': 'sugpo',
    'P-SUG-M': 'sugpo',
    'P-HIP-S': 'hipon',
    'P-HIP-W': 'hipon',
    'P-TAH': 'tahong',
    'P-TAH-C': 'tahong',
    'P-TAL': 'talaba',
    'P-TAL-S': 'talaba',
    'P-ALI-F': 'alimango',
    'P-ALI-M': 'alimango',
    'P-BAN': 'bangus',
    'P-BAN-XL': 'bangus',
    'P-TIL': 'tilapia',
    'P-PUS': 'pusit',
    'P-TUL': 'tulingan',
    'P-NIY': 'niyog',
    'P-SAB': 'saba',
    'P-KAM': 'kamote',
  };
  const outboundCargoFor = (c: Customer) => [
    ...new Set(c.preferredProductIds.map((p) => PREF_CARGO[p]).filter(Boolean)),
  ];

  const JOB_KG: Record<CustomerType, [number, number]> = {
    'Seafood Dealer': [450, 1500],
    Distributor: [800, 2400],
    'Palengke Vendor': [150, 500],
    Restaurant: [60, 220],
    Hotel: [80, 200],
    Resort: [80, 220],
    'Catering Company': [100, 320],
    Grocery: [200, 600],
    Retailer: [200, 600],
    'Agri Trader': [500, 1600],
    Cooperative: [600, 1500],
    'General Merchandise': [500, 1500],
  };
  const BULK_TYPES: CustomerType[] = [
    'Seafood Dealer',
    'Distributor',
    'Palengke Vendor',
    'Grocery',
    'Retailer',
  ];

  const SOURCE_WEIGHTS: [JobSource, number][] = [
    ['Messenger', 34],
    ['Phone', 26],
    ['Repeat Customer', 16],
    ['Sales Staff', 10],
    ['Facebook', 6],
    ['Customer Portal', 5],
    ['Referral', 3],
  ];
  function sourceFor(c: Customer): JobSource {
    if ((c.id === 'CUS-011' || c.id === 'CUS-022') && chance(0.7)) return 'Customer Portal';
    if (c.leadSource === 'Messenger' && chance(0.4)) return 'Messenger';
    const total = SOURCE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = R.rand() * total;
    for (const [src, w] of SOURCE_WEIGHTS) {
      r -= w;
      if (r <= 0) return src;
    }
    return 'Phone';
  }
  const bookedBy = (src: JobSource, c: Customer) => {
    const sp = staffById(c.salespersonId)!.name;
    if (src === 'Customer Portal') return `${c.contacts[0].name} (portal)`;
    if (src === 'Repeat Customer') return `${sp} (repeat booking)`;
    if (src === 'Messenger') return `${sp} via Messenger`;
    return sp;
  };

  /** "5:00 AM – 9:00 AM" → "09:00"; falls back to noon. */
  function windowEnd(hours: string) {
    const all = [...hours.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM|NN)?/g)];
    const last = all[all.length - 1];
    if (!last) return '12:00';
    let h = Number(last[1]);
    const suffix = last[3] ?? (all[0]?.[3] === 'PM' ? 'PM' : 'AM');
    if (suffix === 'PM' && h < 12) h += 12;
    if (suffix === 'NN') h = 12;
    return `${pad(h, 2)}:${last[2]}`;
  }

  // ─── Job & load factories ───────────────────────────────────────────────────
  interface CargoLine {
    key: string;
    kg: number;
  }
  interface JobSpec {
    id?: string;
    customerId: string;
    leg: Leg;
    pickup: Place;
    dropoff: Place;
    consignee?: { name: string; phone: string };
    cargo: CargoLine[];
    loadType?: LoadType;
    pickupAt: string;
    requiredBy: string;
    freight?: number;
    charges?: Charge[];
    source?: JobSource;
    status: JobStatus;
    loadStatus?: LoadStatus;
    tripId?: string;
    createdAt?: string;
    notes?: string;
    instructions?: string;
    quoteId?: string;
    assignedAt?: string;
    /** Fixed confirmation time; otherwise a few minutes after booking. */
    confirmedAt?: string;
  }

  function makeJob(spec: JobSpec) {
    const c = customerById(spec.customerId)!;
    const date = spec.pickupAt.slice(0, 10);
    const id = spec.id ?? nextId('JOB', date);
    const weightKg = spec.cargo.reduce((s, l) => s + l.kg, 0);
    const heaviest = [...spec.cargo].sort((a, b) => b.kg - a.kg)[0];
    const category: CargoCategory = cargoByKey(heaviest.key).category;
    const source = spec.source ?? sourceFor(c);
    const createdAt = spec.createdAt ?? plusMin(spec.pickupAt, -rint(8, 30) * 60);
    const receiver = c.contacts[c.contacts.length > 1 && spec.leg === 'outbound' ? 1 : 0];
    const areaForRate = spec.leg === 'outbound' ? spec.dropoff.areaId : spec.pickup.areaId;
    const freight =
      spec.freight ??
      roundTo(suggestFreight(spec.leg, areaForRate, weightKg) * rfloat(0.97, 1.03), 50);
    const seafood = spec.cargo.some((l) =>
      ['Seafood', 'Shellfish'].includes(cargoByKey(l.key).category),
    );
    const job: LogisticsJob = {
      id,
      customerId: c.id,
      source,
      quoteId: spec.quoteId,
      leg: spec.leg,
      pickup: spec.pickup,
      dropoff: spec.dropoff,
      consignee: spec.consignee ?? { name: receiver.name, phone: receiver.phone },
      cargoDescription: spec.cargo.map((l) => cargoByKey(l.key).label.split(',')[0]).join(' + '),
      cargoCategory: category,
      weightKg,
      truckRequirement:
        weightKg >= 6000
          ? 'Full truck — 10-wheeler'
          : seafood
            ? 'Insulated van, iced cargo'
            : 'Shared van (LTL)',
      pickupAt: spec.pickupAt,
      requiredBy: spec.requiredBy,
      freightCharge: freight,
      additionalCharges: spec.charges ?? [],
      paymentTerms: c.paymentTerms,
      status: spec.status,
      tripId: spec.tripId,
      salespersonId: c.salespersonId,
      instructions: spec.instructions,
      notes: spec.notes,
      createdAt,
      history: [
        {
          at: createdAt,
          label:
            source === 'Customer Portal'
              ? 'Booking submitted via Customer Portal'
              : `Booking received (${source})`,
          by: bookedBy(source, c),
        },
      ],
    };
    if (!['Inquiry', 'Quoted'].includes(spec.status))
      job.history.push({
        at: spec.confirmedAt ?? plusMin(createdAt, rint(6, 50)),
        label: 'Booking confirmed',
        by: staffById(c.salespersonId)!.name,
        note: 'Cargo, pickup time and freight rate confirmed with customer.',
      });
    if (spec.tripId)
      job.history.push({
        at: spec.assignedAt ?? plusMin(createdAt, rint(60, 180)),
        label: `Assigned to ${spec.tripId}`,
        by: DISPATCHER,
      });
    jobs.push(job);
    jobIndex.set(id, job);
    const type: LoadType =
      spec.loadType ??
      (spec.leg === 'outbound' ? 'Outbound' : c.frequency >= 4 ? 'Backhaul' : 'Third-Party');
    const made = spec.cargo.map((l) =>
      makeLoad({
        jobId: id,
        customerId: c.id,
        type,
        leg: spec.leg,
        key: l.key,
        kg: l.kg,
        pickup: spec.pickup,
        destination: spec.dropoff,
        tripId: spec.tripId,
        status: spec.loadStatus ?? (spec.tripId ? 'Assigned' : 'Pending'),
        createdAt,
        date,
      }),
    );
    return { job, loads: made };
  }

  function makeLoad(o: {
    jobId?: string;
    customerId?: string;
    type: LoadType;
    leg: Leg;
    key: string;
    kg: number;
    pickup: Place;
    destination: Place;
    tripId?: string;
    status: LoadStatus;
    createdAt: string;
    date: string;
    note?: string;
  }): Load {
    const cargo = cargoByKey(o.key);
    const load: Load = {
      id: nextId('LOAD', o.date),
      jobId: o.jobId,
      customerId: o.customerId,
      type: o.type,
      leg: o.leg,
      cargoDescription: cargo.label,
      cargoCategory: cargo.category,
      quantity: Math.max(1, Math.round(o.kg / cargo.kgPerUnit)),
      unit: cargo.unit,
      weightKg: o.kg,
      pickup: o.pickup,
      destination: o.destination,
      tripId: o.tripId,
      status: o.status,
      handlingNotes: o.note ?? cargo.handling,
      estimatedValue:
        o.type === 'Company-Owned' && cargo.valuePerKg
          ? Math.round((o.kg * cargo.valuePerKg) / 100) * 100
          : undefined,
      createdAt: o.createdAt,
    };
    loads.push(load);
    return load;
  }

  function companyLoad(
    date: string,
    key: string,
    kg: number,
    pickup: Place,
    tripId: string | undefined,
    status: LoadStatus,
    createdAt: string,
  ) {
    return makeLoad({
      type: 'Company-Owned',
      leg: 'return',
      key,
      kg,
      pickup,
      destination: LUCENA_WAREHOUSE,
      tripId,
      status,
      createdAt,
      date,
      note: 'Company purchase for Lucena bodega sales — procurement pays supplier on pickup.',
    });
  }

  // ─── Consignees for Lucena shippers ─────────────────────────────────────────
  const DALAHICAN_CONSIGNEES: { place: Place; name: string; phone: string }[] = [
    {
      place: {
        name: 'Navotas Fish Port — Bagsakan Hall 3',
        areaId: 'navotas',
        address: 'North Bay Blvd., Navotas City',
      },
      name: 'Benedicto Salonga',
      phone: '0917 330 4418',
    },
    {
      place: {
        name: 'Divisoria Seafood Row (Pritil)',
        areaId: 'manila',
        address: 'Pritil, Tondo, Manila',
      },
      name: 'Rico Dantes',
      phone: '0928 441 0932',
    },
    {
      place: {
        name: 'Commonwealth Market — Fish Section',
        areaId: 'quezon-city',
        address: 'Commonwealth Ave., Quezon City',
      },
      name: 'Aurora Lagdameo',
      phone: '0939 205 6617',
    },
    {
      place: {
        name: 'Sangandaan Fish Market',
        areaId: 'caloocan',
        address: 'A. Mabini St., Caloocan City',
      },
      name: 'Wilson Palma',
      phone: '0917 668 2240',
    },
  ];

  // ─── Backhaul customers ─────────────────────────────────────────────────────
  const BACKHAUL_CUSTOMERS: { id: string; kind: PlaceKind; cargo: string[] }[] = [
    { id: 'CUS-034', kind: 'produce', cargo: ['red-onion', 'garlic', 'ginger'] },
    { id: 'CUS-035', kind: 'produce', cargo: ['red-onion', 'white-onion', 'potato', 'carrots'] },
    { id: 'CUS-036', kind: 'produce', cargo: ['potato', 'carrots', 'cabbage'] },
    { id: 'CUS-038', kind: 'produce', cargo: ['red-onion', 'garlic', 'ginger'] },
    { id: 'CUS-048', kind: 'produce', cargo: ['red-onion', 'potato'] },
    { id: 'CUS-049', kind: 'produce', cargo: ['potato', 'carrots', 'cabbage'] },
    { id: 'CUS-050', kind: 'feeds', cargo: ['feeds', 'rice'] },
    { id: 'CUS-051', kind: 'feeds', cargo: ['feeds'] },
    { id: 'CUS-052', kind: 'frozen', cargo: ['frozen'] },
  ];
  const COMPANY_PRODUCE = ['red-onion', 'garlic', 'ginger', 'potato', 'white-onion'];

  // ─── Historic trips ─────────────────────────────────────────────────────────
  interface CostPlan {
    trip: Trip;
    mode: 'full' | 'in-transit' | 'loading';
  }
  const costPlans: CostPlan[] = [];

  function newTrip(
    id: string,
    date: string,
    truckId: string,
    driverId: string,
    routeId: string,
    status: Trip['status'],
    departure: string,
    expectedReturn: string,
    notes?: string,
  ): Trip {
    const t: Trip = {
      id,
      date,
      truckId,
      driverId,
      helperIds: HELPERS_BY_TRUCK[truckId],
      routeId,
      status,
      departure,
      expectedReturn,
      stops: [],
      notes,
      history: [],
    };
    trips.push(t);
    return t;
  }

  function buildHistoricTrip(truckId: string, date: string, used: Set<string>) {
    const routeId = TRUCK_PATTERN[truckId][weekdayOf(date)];
    const route = routeById(routeId);
    const truck = truckById(truckId);
    const id = tripIdFor(date, truckId);
    const departure = at(date, route.departure);
    const trip = newTrip(
      id,
      date,
      truckId,
      driverFor(truckId, date),
      routeId,
      'Completed',
      departure,
      at(date, route.expectedReturn),
    );
    trip.actualDeparture = plusMin(departure, rint(0, 14));

    // Outbound bookings along the route
    const candidates = CUSTOMERS.filter(
      (c) =>
        c.fulfillment === 'truck' &&
        route.outboundAreas.includes(c.areaId) &&
        c.customerSince <= date &&
        c.status !== 'inactive' &&
        !used.has(c.id) &&
        outboundCargoFor(c).length > 0,
    ).sort((a, b) => route.outboundAreas.indexOf(a.areaId) - route.outboundAreas.indexOf(b.areaId));
    interface Draft {
      c: Customer;
      cargo: CargoLine[];
      consignee?: (typeof DALAHICAN_CONSIGNEES)[number];
    }
    const drafts: Draft[] = [];
    const cargoFor = (c: Customer): CargoLine[] => {
      const keys = outboundCargoFor(c);
      const chosen = keys.length > 1 && chance(0.4) ? shuffle(keys).slice(0, 2) : [keys[0]];
      const [lo, hi] = JOB_KG[c.type];
      const total = rfloat(lo, hi);
      return chosen.map((key, i) => ({
        key,
        kg: roundTo(chosen.length === 1 ? total : total * (i === 0 ? 0.6 : 0.4), 10),
      }));
    };
    for (const c of candidates) {
      const p = c.paymentBehavior === 'delinquent' ? 0.2 : 0.25 + c.frequency * 0.06;
      if (chance(p)) {
        drafts.push({ c, cargo: cargoFor(c) });
        used.add(c.id);
      }
    }
    if (!drafts.some((d) => d.c.type === 'Seafood Dealer' || d.c.type === 'Distributor')) {
      const anchor = candidates
        .filter((c) => (c.type === 'Seafood Dealer' || c.type === 'Distributor') && !used.has(c.id))
        .sort((a, b) => b.frequency - a.frequency)[0];
      if (anchor) {
        drafts.push({ c: anchor, cargo: cargoFor(anchor) });
        used.add(anchor.id);
      }
    }
    // Lucena shippers booking space for their Manila buyers
    const shipperConsignees = DALAHICAN_CONSIGNEES.filter((x) =>
      route.outboundAreas.includes(x.place.areaId),
    );
    if (shipperConsignees.length && chance(0.5))
      drafts.push({
        c: customerById('CUS-047')!,
        cargo: [{ key: chance(0.7) ? 'sugpo' : 'pusit', kg: roundTo(rfloat(400, 1200), 10) }],
        consignee: pick(shipperConsignees),
      });
    // Inter-island consolidation via Batangas Port on the Batangas run
    if (route.outboundAreas.includes('batangas-city') && chance(0.35)) {
      const partner = pick(
        CUSTOMERS.filter((c) => c.fulfillment === 'partner' && c.customerSince <= date),
      );
      if (partner)
        drafts.push({
          c: partner,
          cargo: [{ key: pick(['niyog', 'sugpo', 'kamote']), kg: roundTo(rfloat(900, 2200), 50) }],
        });
    }

    // Fill toward a realistic load, then trim anything that would overload the van.
    const cap = truck.capacityKg;
    const target = cap * rfloat(0.7, 0.92);
    const totalKg = () => drafts.reduce((s, d) => s + d.cargo.reduce((a, l) => a + l.kg, 0), 0);
    const scalable = drafts.filter((d) => BULK_TYPES.includes(d.c.type) && !d.consignee);
    const scalableKg = scalable.reduce((s, d) => s + d.cargo.reduce((a, l) => a + l.kg, 0), 0);
    if (totalKg() < target && scalableKg > 0) {
      const f = Math.min(2.4, 1 + (target - totalKg()) / scalableKg);
      for (const d of scalable) for (const l of d.cargo) l.kg = roundTo(l.kg * f, 10);
    }
    while (totalKg() > cap * 0.96 && drafts.length > 1) {
      const [removed] = drafts.splice(drafts.length - 1, 1);
      used.delete(removed.c.id);
    }

    const tripJobs: LogisticsJob[] = [];
    for (const d of drafts) {
      const partner = d.c.fulfillment === 'partner';
      const dropoff: Place = d.consignee
        ? d.consignee.place
        : partner
          ? {
              name: placeByName('Batangas Port — Isla Reefer handover')!.name,
              areaId: 'batangas-city',
              address: placeByName('Batangas Port — Isla Reefer handover')!.address,
            }
          : customerPlace(d.c);
      const pickup = d.consignee ? placeByName('Dalahican Fish Port')! : LUCENA_WAREHOUSE;
      const reqEnd = partner
        ? '14:00'
        : d.consignee
          ? '09:00'
          : windowEnd(d.c.addresses[0].receivingHours);
      const cancelled = chance(0.02);
      const { job } = makeJob({
        customerId: d.c.id,
        leg: 'outbound',
        pickup: { name: pickup.name, areaId: pickup.areaId, address: pickup.address },
        dropoff,
        consignee: d.consignee
          ? { name: d.consignee.name, phone: d.consignee.phone }
          : partner
            ? { name: `${INTER_ISLAND_PARTNER.name} — port handover`, phone: '0917 800 4521' }
            : undefined,
        cargo: d.cargo,
        pickupAt: plusMin(departure, -rint(60, 120)),
        requiredBy: at(date, reqEnd),
        charges: extraCharges(d.c, d.cargo, dropoff),
        status: cancelled ? 'Cancelled' : 'Completed',
        loadStatus: cancelled ? 'Cancelled' : 'Delivered',
        tripId: cancelled ? undefined : id,
        createdAt: at(addDaysISO(date, -1), `${pad(rint(9, 21), 2)}:${pad(rint(0, 59), 2)}`),
        notes: partner
          ? `${INTER_ISLAND_PARTNER.note}. Sea freight billed separately by the partner.`
          : undefined,
      });
      if (cancelled) {
        job.cancelReason = pick([
          'Customer postponed — stall closed for the day',
          "Shipper's harvest delayed to next day",
          'Duplicate booking via Messenger and phone',
        ]);
        job.history.push({
          at: plusMin(job.createdAt, 300),
          label: 'Booking cancelled',
          by: staffById(d.c.salespersonId)!.name,
          note: job.cancelReason,
        });
        continue;
      }
      tripJobs.push(job);
    }

    buildReturn(trip, 'done');
    finishHistoricTrip(trip);
    costPlans.push({ trip, mode: 'full' });
    return tripJobs;
  }

  function extraCharges(c: Customer, cargo: CargoLine[], dropoff: Place): Charge[] {
    const out: Charge[] = [];
    const seafood = cargo.some((l) =>
      ['sugpo', 'hipon', 'pusit', 'bangus', 'tilapia', 'tulingan'].includes(l.key),
    );
    if (seafood && chance(0.18))
      out.push({ label: 'Re-icing en route', amount: pick([300, 400, 500]) });
    if (dropoff.areaId === 'navotas' && chance(0.3))
      out.push({ label: 'Fish port gate fee (pass-through)', amount: 150 });
    if (c.addresses.length > 1 && chance(0.2))
      out.push({ label: 'Second drop point', amount: 800 });
    if (chance(0.06)) out.push({ label: 'Waiting time (1 hr)', amount: 500 });
    return out;
  }

  /** Return-leg cargo: company-owned produce and paid backhaul freight toward Quezon. */
  function buildReturn(trip: Trip, mode: 'done' | 'planned') {
    const route = routeById(trip.routeId);
    const retPlaces = PLACES.filter((p) => route.returnAreas.includes(p.areaId));
    const byKind = (k: PlaceKind) => retPlaces.filter((p) => p.kinds.includes(k));
    const cap = truckById(trip.truckId).capacityKg;
    const target = cap * rfloat(0.3, 0.78);
    let used = 0;
    const loadStatus: LoadStatus = mode === 'done' ? 'Delivered' : 'Assigned';
    const createdAt = at(
      addDaysISO(trip.date, -1),
      `${pad(rint(14, 19), 2)}:${pad(rint(0, 59), 2)}`,
    );
    if (byKind('produce').length && chance(0.65)) {
      const place = pick(byKind('produce'));
      for (const key of shuffle(COMPANY_PRODUCE).slice(0, rint(1, 2))) {
        const kg = roundTo(target * rfloat(0.2, 0.38), 50);
        companyLoad(trip.date, key, kg, place, trip.id, loadStatus, createdAt);
        used += kg;
      }
    }
    const pool = shuffle(
      BACKHAUL_CUSTOMERS.filter(
        (b) => byKind(b.kind).length && customerById(b.id)!.customerSince <= trip.date,
      ),
    );
    const n = chance(0.25) ? 2 : chance(0.75) ? 1 : 0;
    for (const b of pool.slice(0, n)) {
      const c = customerById(b.id)!;
      const kg = roundTo(Math.max(400, Math.min(1800, (target - used) * rfloat(0.4, 0.8))), 50);
      const keys = shuffle(b.cargo).slice(0, kg > 900 && b.cargo.length > 1 ? 2 : 1);
      const cargo = keys.map((key, i) => ({
        key,
        kg: roundTo(keys.length === 1 ? kg : kg * (i === 0 ? 0.6 : 0.4), 50),
      }));
      makeJob({
        customerId: c.id,
        leg: 'return',
        pickup: pick(byKind(b.kind)),
        dropoff: customerPlace(c),
        cargo,
        pickupAt: at(trip.date, '13:00'),
        requiredBy: at(trip.date, windowEnd(c.addresses[0].receivingHours)),
        status: mode === 'done' ? 'Completed' : 'Assigned',
        loadStatus,
        tripId: trip.id,
        createdAt,
      });
      used += kg;
    }
  }

  /** Plan stops from the trip's loads and play the day out with realistic actual times. */
  function finishHistoricTrip(trip: Trip) {
    const tl = loads.filter((l) => l.tripId === trip.id && l.status !== 'Cancelled');
    const stops = planStops(trip, tl, ctx);
    let clock = trip.actualDeparture!;
    let prevArea = stops[0].location.areaId;
    stops.forEach((s, i) => {
      if (i === 0) {
        s.actualArrival = plusMin(s.plannedArrival, -rint(0, 15));
        s.actualDeparture = trip.actualDeparture;
      } else {
        s.actualArrival = plusMin(
          clock,
          travelMinutes(prevArea, s.location.areaId) + rint(-10, 25),
        );
        s.actualDeparture = plusMin(
          s.actualArrival,
          s.type === 'Backhaul Pickup' ? rint(35, 70) : rint(15, 35),
        );
        clock = s.actualDeparture;
      }
      prevArea = s.location.areaId;
      s.status = 'Completed';
    });
    trip.stops = stops;
    trip.actualReturn = stops[stops.length - 1].actualArrival;
    trip.history = [
      { at: at(addDaysISO(trip.date, -1), '17:30'), label: 'Trip planned', by: DISPATCHER },
      { at: plusMin(trip.departure, -75), label: 'Loading started', by: WAREHOUSE_STAFF },
      {
        at: trip.actualDeparture!,
        label: 'Dispatched from Lucena',
        by: driverById(trip.driverId).name,
      },
      { at: trip.actualReturn!, label: 'Returned to Lucena — trip closed', by: DISPATCHER },
    ];
    syncJobsWithStops(trip);
    for (const job of jobs.filter((j) => j.tripId === trip.id && j.status === 'Completed'))
      createDelivery(trip, job, 'done');
  }

  /** Align job pickup / due times with the planned stops. */
  function syncJobsWithStops(trip: Trip) {
    for (const job of jobs.filter((j) => j.tripId === trip.id)) {
      const ids = loads.filter((l) => l.jobId === job.id).map((l) => l.id);
      const pu = trip.stops.find((s) => s.loaded.some((x) => ids.includes(x)));
      if (pu && job.leg === 'return') {
        job.pickupAt = pu.plannedArrival;
        if (job.requiredBy < job.pickupAt) job.requiredBy = plusMin(job.pickupAt, 8 * 60);
      }
    }
  }

  function createDelivery(trip: Trip, job: LogisticsJob, mode: 'done' | 'live'): Delivery {
    const ids = loads.filter((l) => l.jobId === job.id && l.tripId === trip.id).map((l) => l.id);
    const stop = trip.stops.find((s) => s.unloaded.some((x) => ids.includes(x)))!;
    const d: Delivery = {
      id: deliveryIdForJob(job.id),
      jobId: job.id,
      tripId: trip.id,
      customerId: job.customerId,
      loadIds: ids,
      status: 'Scheduled',
      eta: stop.plannedArrival,
      issues: [],
    };
    if (mode === 'done') {
      d.status = 'Delivered';
      d.arrivedAt = stop.actualArrival;
      d.completedAt = plusMin(stop.actualDeparture!, -rint(0, 6));
      const driver = driverById(trip.driverId).name;
      const damaged = chance(0.03) ? roundTo(job.weightKg * rfloat(0.005, 0.02), 1) : undefined;
      const short =
        !damaged && chance(0.02) ? roundTo(job.weightKg * rfloat(0.01, 0.03), 5) : undefined;
      d.pod = {
        receivedBy: job.consignee.name,
        signedAt: d.completedAt,
        receiptNo: nextDr(),
        signatureCaptured: true,
        photoCount: rint(1, 3),
        damagedKg: damaged,
        shortKg: short,
        customerRemarks: damaged
          ? 'Some cargo arrived damaged — noted on DR.'
          : short
            ? "Count short vs. shipper's manifest."
            : undefined,
        driverNotes: damaged ? 'Ice melted on 2 boxes after Skyway traffic.' : undefined,
      };
      const late = d.arrivedAt! > plusMin(job.requiredBy, 20);
      if (late && chance(0.5))
        d.issues.push({
          type: 'Late Arrival',
          note: `Arrived ${Math.round((Date.parse(d.arrivedAt!) - Date.parse(job.requiredBy)) / 60000)} min after the receiving window.`,
          reportedAt: d.arrivedAt!,
          reportedBy: driver,
        });
      if (damaged)
        d.issues.push({
          type: 'Damaged Cargo',
          note: `${damaged} kg damaged on arrival.`,
          reportedAt: d.completedAt!,
          reportedBy: driver,
        });
      if (short)
        d.issues.push({
          type: 'Short Quantity',
          note: `${short} kg short against the shipper's count.`,
          reportedAt: d.completedAt!,
          reportedBy: driver,
        });
      job.deliveredAt = d.completedAt;
    }
    deliveries.push(d);
    return d;
  }

  // ─── HISTORY: Aug 26 → Sep 24 ───────────────────────────────────────────────
  for (let date = START; date < TODAY; date = addDaysISO(date, 1)) {
    if (weekdayOf(date) === 0) continue;
    const used = new Set<string>();
    for (const truck of TRUCKS) {
      if (TRUCK_DOWN[truck.id].includes(date)) continue;
      buildHistoricTrip(truck.id, date, used);
    }
  }

  // One historic delivery returned to Lucena — stall flooded after habagat rains.
  {
    const victim = jobs.find(
      (j) => j.customerId === 'CUS-020' && j.pickupAt >= '2026-09-05' && j.status === 'Completed',
    );
    if (victim) {
      const dl = deliveries.find((d) => d.jobId === victim.id)!;
      dl.status = 'Returned';
      dl.failureReason =
        'Dampa stall closed — area flooded after overnight habagat rains. Cargo brought back iced to Lucena and released to the shipper.';
      dl.issues = [
        {
          type: 'Consignee Unavailable',
          note: dl.failureReason,
          reportedAt: dl.arrivedAt!,
          reportedBy: driverById(trips.find((t) => t.id === victim.tripId)!.driverId).name,
        },
      ];
      dl.completedAt = undefined;
      dl.pod = undefined;
      victim.status = 'Cancelled';
      victim.deliveredAt = undefined;
      victim.cancelReason = 'Returned — consignee stall flooded (no charge per owner)';
      victim.history.push({
        at: dl.arrivedAt!,
        label: 'Delivery failed — cargo returned to Lucena',
        by: dl.issues[0].reportedBy,
        note: dl.failureReason,
      });
      for (const l of loads) if (l.jobId === victim.id) l.status = 'Cancelled';
    }
  }

  // ─── Opening balances migrated from the paper ledger at go-live ─────────────
  const GO_LIVE_NOTE =
    'Opening balance migrated from the paper freight ledger at TradeLoop go-live (Aug 26, 2026).';
  const OPENING: [
    customerId: string,
    date: string,
    cargo: CargoLine[],
    freight: number,
    paid: number,
    paidOn?: string,
  ][] = [
    ['CUS-002', '2026-07-10', [{ key: 'sugpo', kg: 900 }], 10400, 4000, '2026-09-03'],
    [
      'CUS-002',
      '2026-08-07',
      [
        { key: 'sugpo', kg: 700 },
        { key: 'hipon', kg: 300 },
      ],
      11600,
      0,
    ],
    [
      'CUS-020',
      '2026-08-12',
      [
        { key: 'sugpo', kg: 250 },
        { key: 'alimango', kg: 80 },
      ],
      3500,
      1500,
      '2026-09-12',
    ],
    ['CUS-050', '2026-07-24', [{ key: 'feeds', kg: 1600 }], 8000, 0],
    [
      'CUS-018',
      '2026-08-14',
      [
        { key: 'tahong', kg: 900 },
        { key: 'sugpo', kg: 200 },
      ],
      12100,
      5000,
      '2026-09-18',
    ],
  ];
  const openingJobs: { job: LogisticsJob; paid: number; paidOn?: string }[] = [];
  for (const [cid, date, cargo, freight, paid, paidOn] of OPENING) {
    const c = customerById(cid)!;
    const leg: Leg = c.areaId === 'sariaya' ? 'return' : 'outbound';
    const { job } = makeJob({
      customerId: cid,
      leg,
      pickup: leg === 'outbound' ? LUCENA_WAREHOUSE : placeByName('Calamba Feeds & Agri Depot')!,
      dropoff: customerPlace(c),
      cargo,
      pickupAt: at(date, '03:00'),
      requiredBy: at(date, '10:00'),
      freight,
      source: 'Phone',
      status: 'Completed',
      loadStatus: 'Delivered',
      createdAt: at(addDaysISO(date, -1), '15:00'),
      notes: GO_LIVE_NOTE,
    });
    job.deliveredAt = at(date, '09:30');
    job.history = [
      {
        at: '2026-08-26T08:00',
        label: 'Migrated from paper freight ledger',
        by: ACCOUNTING,
        note: GO_LIVE_NOTE,
      },
    ];
    openingJobs.push({ job, paid, paidOn });
  }

  // ─── TODAY: Fri Sep 25 (clock at 07:48) ─────────────────────────────────────
  const T01 = 'TRIP-260925-01';
  const T02 = 'TRIP-260925-02';
  const t01 = newTrip(
    T01,
    TODAY,
    'TRK-01',
    'DRV-01',
    'RT-NV',
    'In Transit',
    at(TODAY, '03:30'),
    at(TODAY, '20:30'),
    'Navotas port gate congested this morning — expect +20 min on Valenzuela stops.',
  );
  t01.actualDeparture = at(TODAY, '03:34');
  t01.odometerStart = truckById('TRK-01').mileageKm;
  const t02 = newTrip(
    T02,
    TODAY,
    'TRK-02',
    'DRV-02',
    'RT-CAV',
    'Loading',
    at(TODAY, '09:00'),
    at(TODAY, '20:00'),
    'Late departure — waiting for the 8:00 AM sugpo harvest from Tayabas to reach the bodega.',
  );

  interface Scripted {
    no: string;
    customerId: string;
    cargo: [string, number][];
    freight: number;
    source: JobSource;
    status: JobStatus;
    createdAt: string;
    req: string;
    charges?: Charge[];
    notes?: string;
    instructions?: string;
    loadType?: LoadType;
    loadStatus?: LoadStatus;
    pickup?: Place;
    dropoff?: Place;
    quoteId?: string;
    confirmedAt?: string;
  }
  function scripted(date: string, trip: Trip | undefined, leg: Leg, s: Scripted) {
    const c = customerById(s.customerId)!;
    return makeJob({
      id: reserveId('JOB', date, s.no),
      customerId: s.customerId,
      leg,
      pickup: s.pickup ?? LUCENA_WAREHOUSE,
      dropoff: s.dropoff ?? customerPlace(c),
      cargo: s.cargo.map(([key, kg]) => ({ key, kg })),
      loadType: s.loadType,
      pickupAt:
        leg === 'outbound' ? plusMin(trip?.departure ?? at(date, '03:30'), -90) : at(date, '13:00'),
      requiredBy: at(s.req.length > 5 ? s.req.slice(0, 10) : date, s.req.slice(-5)),
      freight: s.freight,
      charges: s.charges,
      source: s.source,
      status: s.status,
      loadStatus: s.loadStatus,
      tripId: trip?.id,
      createdAt: s.createdAt,
      notes: s.notes,
      instructions: s.instructions,
      quoteId: s.quoteId,
      assignedAt: trip ? plusMin(s.createdAt, 90) : undefined,
      confirmedAt: s.confirmedAt,
    });
  }

  // Truck 01 — Lucena → Navotas → Valenzuela, return via Valenzuela / Balintawak
  const VZ_DEPOT = placeByName('Valenzuela Produce Depot — Bodega 7')!;
  const BALINTAWAK = placeByName('Balintawak Market (Cloverleaf) Bagsakan')!;
  const t01Out: Scripted[] = [
    {
      no: '001',
      customerId: 'CUS-001',
      cargo: [['sugpo', 2500]],
      freight: 28000,
      source: 'Messenger',
      status: 'Delivered',
      loadStatus: 'Delivered',
      createdAt: '2026-09-24T16:42',
      req: '08:00',
      instructions: 'Unload at stalls 14–16; Lani weighs on the port scale.',
    },
    {
      no: '002',
      customerId: 'CUS-002',
      cargo: [['sugpo', 600]],
      freight: 6600,
      source: 'Phone',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-24T21:15',
      req: '09:30',
      notes:
        'Account has overdue freight — Rodel approved a one-time release. Driver to collect freight on delivery.',
    },
    {
      no: '003',
      customerId: 'CUS-003',
      cargo: [['tahong', 450]],
      freight: 4950,
      source: 'Messenger',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-24T18:03',
      req: '10:30',
    },
    {
      no: '004',
      customerId: 'CUS-004',
      cargo: [
        ['tahong', 1000],
        ['talaba', 500],
      ],
      freight: 15750,
      source: 'Sales Staff',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-24T14:20',
      req: '11:00',
    },
    {
      no: '005',
      customerId: 'CUS-010',
      cargo: [
        ['hipon', 120],
        ['bangus', 180],
      ],
      freight: 3300,
      source: 'Phone',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-24T19:40',
      req: '09:00',
    },
    {
      no: '006',
      customerId: 'CUS-006',
      cargo: [['tahong', 500]],
      freight: 5500,
      source: 'Messenger',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-24T20:11',
      req: '10:00',
    },
    {
      no: '007',
      customerId: 'CUS-008',
      cargo: [
        ['sugpo', 300],
        ['hipon', 200],
      ],
      freight: 5500,
      source: 'Repeat Customer',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-22T06:00',
      req: '12:00',
      notes: 'Friday repeat booking; hipon added by phone.',
    },
    {
      no: '008',
      customerId: 'CUS-009',
      cargo: [['niyog', 900]],
      freight: 9400,
      source: 'Phone',
      status: 'In Transit',
      loadStatus: 'In Transit',
      createdAt: '2026-09-24T10:05',
      req: '15:00',
    },
  ];
  for (const s of t01Out) scripted(TODAY, t01, 'outbound', s);
  companyLoad(TODAY, 'red-onion', 1800, VZ_DEPOT, T01, 'Assigned', '2026-09-24T16:10');
  companyLoad(TODAY, 'garlic', 700, VZ_DEPOT, T01, 'Assigned', '2026-09-24T16:10');
  scripted(TODAY, t01, 'return', {
    no: '009',
    customerId: 'CUS-035',
    cargo: [
      ['ginger', 400],
      ['potato', 600],
    ],
    freight: 5000,
    source: 'Phone',
    status: 'Assigned',
    createdAt: '2026-09-24T15:30',
    req: '21:00',
    pickup: BALINTAWAK,
    loadType: 'Backhaul',
  });
  scripted(TODAY, t01, 'return', {
    no: '010',
    customerId: 'CUS-034',
    cargo: [['red-onion', 600]],
    freight: 2500,
    source: 'Messenger',
    status: 'Assigned',
    createdAt: '2026-09-24T20:05',
    req: '22:00',
    pickup: BALINTAWAK,
    loadType: 'Third-Party',
    notes: 'Josefina bought 24 sacks at Balintawak; pasabay on our return leg.',
  });

  // Truck 02 — Lucena → Bacoor → Imus, return via Santa Rosa / Calamba (loading now)
  const CALAMBA_FEEDS = placeByName('Calamba Feeds & Agri Depot')!;
  const STA_ROSA = placeByName('Santa Rosa Agri Warehouse')!;
  const t02Out: Scripted[] = [
    {
      no: '011',
      customerId: 'CUS-022',
      cargo: [['sugpo', 150]],
      freight: 1800,
      source: 'Customer Portal',
      status: 'Assigned',
      loadStatus: 'Loaded',
      createdAt: '2026-09-24T09:12',
      req: '13:00',
      charges: [{ label: 'Re-icing en route', amount: 300 }],
    },
    {
      no: '012',
      customerId: 'CUS-023',
      cargo: [
        ['sugpo', 150],
        ['talaba', 120],
      ],
      freight: 2700,
      source: 'Messenger',
      status: 'Assigned',
      loadStatus: 'Loaded',
      createdAt: '2026-09-24T22:05',
      req: '14:00',
    },
    {
      no: '013',
      customerId: 'CUS-024',
      cargo: [
        ['tahong', 1400],
        ['niyog', 1200],
      ],
      freight: 24700,
      source: 'Phone',
      status: 'Assigned',
      loadStatus: 'Loaded',
      createdAt: '2026-09-24T15:30',
      req: '13:00',
    },
    {
      no: '014',
      customerId: 'CUS-025',
      cargo: [
        ['tahong', 400],
        ['bangus', 250],
      ],
      freight: 6500,
      source: 'Messenger',
      status: 'Assigned',
      loadStatus: 'Loaded',
      createdAt: '2026-09-24T19:22',
      req: '15:00',
    },
    {
      no: '015',
      customerId: 'CUS-026',
      cargo: [
        ['sugpo', 100],
        ['pusit', 60],
        ['bangus', 120],
      ],
      freight: 2800,
      source: 'Phone',
      status: 'Assigned',
      createdAt: '2026-09-24T11:48',
      req: '15:00',
      instructions: 'For a Saturday wedding in Imus — deliver before 3:00 PM.',
    },
    {
      no: '016',
      customerId: 'CUS-027',
      cargo: [
        ['sugpo', 250],
        ['hipon', 180],
        ['bangus', 300],
      ],
      freight: 7300,
      source: 'Sales Staff',
      status: 'Assigned',
      createdAt: '2026-09-24T13:10',
      req: '16:00',
      notes: 'Sugpo arriving from Tayabas ponds at 8:00 AM.',
    },
  ];
  for (const s of t02Out) scripted(TODAY, t02, 'outbound', s);
  scripted(TODAY, t02, 'return', {
    no: '017',
    customerId: 'CUS-051',
    cargo: [['feeds', 1500]],
    freight: 7500,
    source: 'Phone',
    status: 'Assigned',
    createdAt: '2026-09-23T10:40',
    req: '21:30',
    pickup: CALAMBA_FEEDS,
    loadType: 'Backhaul',
  });
  scripted(TODAY, t02, 'return', {
    no: '018',
    customerId: 'CUS-050',
    cargo: [['rice', 800]],
    freight: 4000,
    source: 'Phone',
    status: 'Assigned',
    createdAt: '2026-09-24T09:30',
    req: '21:00',
    pickup: STA_ROSA,
    loadType: 'Backhaul',
  });
  // Requested on the Backhaul Marketplace (BKR-260925-001) and confirmed by dispatch.
  scripted(TODAY, t02, 'return', {
    no: '022',
    customerId: 'CUS-053',
    cargo: [['feeds', 1000]],
    freight: 4500,
    source: 'Backhaul Marketplace',
    status: 'Assigned',
    createdAt: '2026-09-25T06:52',
    confirmedAt: '2026-09-25T07:04',
    req: '21:30',
    pickup: CALAMBA_FEEDS,
    loadType: 'Third-Party',
    notes: 'Requested through the Backhaul Marketplace (BKR-260925-001). First booking — COD.',
  });

  // Unassigned today — dispatch opportunities
  scripted(TODAY, undefined, 'outbound', {
    no: '019',
    customerId: 'CUS-029',
    cargo: [
      ['tahong', 800],
      ['bangus', 400],
    ],
    freight: 12000,
    source: 'Sales Staff',
    status: 'Awaiting Dispatch',
    createdAt: '2026-09-25T06:20',
    req: '16:00',
    quoteId: 'QT-260915-001',
    notes: 'Arnold called at 6:15 AM — can Truck 02 add General Trias after Imus?',
  });
  scripted(TODAY, undefined, 'return', {
    no: '020',
    customerId: 'CUS-049',
    cargo: [
      ['potato', 700],
      ['carrots', 500],
    ],
    freight: 6000,
    source: 'Messenger',
    status: 'Awaiting Dispatch',
    createdAt: '2026-09-25T06:40',
    req: '22:00',
    pickup: STA_ROSA,
  });
  scripted(TODAY, undefined, 'return', {
    no: '021',
    customerId: 'CUS-048',
    cargo: [['red-onion', 1200]],
    freight: 6000,
    source: 'Phone',
    status: 'Awaiting Dispatch',
    createdAt: '2026-09-25T07:05',
    req: '22:00',
    pickup: VZ_DEPOT,
    notes: "Nestor's onions are ready at Bodega 7 from 11:00 AM.",
  });

  /** Plan today's stops and mark the progress of Truck 01 as of 07:48. */
  {
    const plan = (t: Trip) =>
      (t.stops = planStops(
        t,
        loads.filter((l) => l.tripId === t.id),
        ctx,
      ));
    plan(t01);
    const [wh, first] = t01.stops;
    wh.actualArrival = at(TODAY, '01:40');
    wh.actualDeparture = t01.actualDeparture;
    wh.status = 'Completed';
    first.actualArrival = at(TODAY, '07:05');
    first.actualDeparture = at(TODAY, '07:31');
    first.status = 'Completed';
    first.notes = '2,500 kg weighed on the port scale — no variance.';
    t01.stops = planStops(
      t01,
      loads.filter((l) => l.tripId === T01),
      ctx,
      t01.stops,
    );
    // Port congestion: push remaining ETAs by 20 minutes.
    for (const s of t01.stops)
      if (s.status === 'Pending' && s.seq > 2) {
        s.plannedArrival = plusMin(s.plannedArrival, 20);
        s.plannedDeparture = plusMin(s.plannedDeparture, 20);
      }
    t01.history = [
      { at: '2026-09-24T17:30', label: 'Trip planned', by: DISPATCHER },
      { at: '2026-09-25T01:45', label: 'Loading started', by: WAREHOUSE_STAFF },
      {
        at: '2026-09-25T03:20',
        label: 'Cargo manifest checked — 7,250 kg outbound',
        by: WAREHOUSE_STAFF,
      },
      { at: '2026-09-25T03:34', label: 'Dispatched from Lucena', by: 'Joel Mendoza' },
      {
        at: '2026-09-25T06:48',
        label: 'Delay reported: Navotas port gate congestion',
        by: 'Joel Mendoza',
        note: 'Queue at the fish port gate; +20 min expected.',
      },
    ];
    plan(t02);
    t02.stops[0].actualArrival = at(TODAY, '07:10');
    t02.stops[0].status = 'Arrived';
    t02.history = [
      { at: '2026-09-24T18:45', label: 'Trip planned', by: DISPATCHER },
      {
        at: '2026-09-25T07:15',
        label: 'Loading started',
        by: WAREHOUSE_STAFF,
        note: 'Holding space for the Tayabas sugpo (8:00 AM).',
      },
    ];
    syncJobsWithStops(t01);
    syncJobsWithStops(t02);
    for (const job of jobs.filter((j) => j.tripId === T01 || j.tripId === T02)) {
      const trip = job.tripId === T01 ? t01 : t02;
      const d = createDelivery(trip, job, 'live');
      if (job.id === 'JOB-260925-001') {
        d.status = 'Delivered';
        d.arrivedAt = at(TODAY, '07:05');
        d.completedAt = at(TODAY, '07:28');
        d.pod = {
          receivedBy: 'Lani Tan',
          signedAt: d.completedAt,
          receiptNo: nextDr(),
          signatureCaptured: true,
          photoCount: 2,
          customerRemarks: '2,500 kg weighed on the port scale — no variance.',
        };
        job.deliveredAt = d.completedAt;
        job.history.push({
          at: d.completedAt,
          label: 'Delivered — POD captured',
          by: 'Joel Mendoza',
        });
      } else if (trip === t01 && job.leg === 'outbound') {
        d.status = job.id === 'JOB-260925-002' ? 'In Transit' : 'Scheduled';
      } else if (trip === t02 && job.leg === 'outbound') d.status = 'Loading';
      if (job.id === 'JOB-260925-005')
        d.issues.push({
          type: 'Late Arrival',
          note: 'Receiving window ends 9:00 AM but ETA is after 9:30 AM (port congestion). Boyet informed by phone.',
          reportedAt: '2026-09-25T07:40',
          reportedBy: DISPATCHER,
        });
    }
    costPlans.push({ trip: t01, mode: 'in-transit' }, { trip: t02, mode: 'loading' });
  }

  // ─── TOMORROW: Sat Sep 26 — dispatch plan ───────────────────────────────────
  const D1 = newTrip(
    'TRIP-260926-01',
    TOMORROW,
    'TRK-01',
    'DRV-03',
    'RT-NV',
    'Planned',
    at(TOMORROW, '03:30'),
    at(TOMORROW, '20:30'),
  );
  const D2 = newTrip(
    'TRIP-260926-02',
    TOMORROW,
    'TRK-02',
    'DRV-04',
    'RT-SOU',
    'Planned',
    at(TOMORROW, '04:00'),
    at(TOMORROW, '19:00'),
  );
  const tmr: [Trip | undefined, Leg, Scripted][] = [
    [
      D1,
      'outbound',
      {
        no: '001',
        customerId: 'CUS-001',
        cargo: [['sugpo', 1800]],
        freight: 19150,
        source: 'Messenger',
        status: 'Assigned',
        createdAt: '2026-09-25T06:10',
        req: '08:00',
      },
    ],
    [
      D1,
      'outbound',
      {
        no: '002',
        customerId: 'CUS-004',
        cargo: [
          ['tahong', 1200],
          ['talaba', 400],
        ],
        freight: 17000,
        source: 'Sales Staff',
        status: 'Assigned',
        createdAt: '2026-09-24T15:40',
        req: '11:00',
      },
    ],
    [
      D1,
      'outbound',
      {
        no: '003',
        customerId: 'CUS-005',
        cargo: [
          ['hipon', 200],
          ['tilapia', 150],
        ],
        freight: 3900,
        source: 'Messenger',
        status: 'Assigned',
        createdAt: '2026-09-25T05:05',
        req: '08:00',
      },
    ],
    [
      D1,
      'outbound',
      {
        no: '004',
        customerId: 'CUS-008',
        cargo: [
          ['sugpo', 250],
          ['bangus', 400],
        ],
        freight: 7450,
        source: 'Phone',
        status: 'Assigned',
        createdAt: '2026-09-24T17:55',
        req: '12:00',
      },
    ],
    [
      D1,
      'outbound',
      {
        no: '005',
        customerId: 'CUS-009',
        cargo: [['niyog', 1000]],
        freight: 11500,
        source: 'Phone',
        status: 'Assigned',
        createdAt: '2026-09-24T10:30',
        req: '15:00',
      },
    ],
    [
      D1,
      'return',
      {
        no: '006',
        customerId: 'CUS-048',
        cargo: [['potato', 800]],
        freight: 4000,
        source: 'Phone',
        status: 'Assigned',
        createdAt: '2026-09-25T07:10',
        req: '21:00',
        pickup: BALINTAWAK,
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '007',
        customerId: 'CUS-002',
        cargo: [['sugpo', 500]],
        freight: 5500,
        source: 'Phone',
        status: 'Confirmed',
        createdAt: '2026-09-25T07:05',
        req: '09:30',
        notes:
          'Credit hold — overdue freight balance. Needs owner/accounting approval before dispatch.',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '008',
        customerId: 'CUS-003',
        cargo: [['talaba', 350]],
        freight: 3850,
        source: 'Messenger',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T06:40',
        req: '10:30',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '009',
        customerId: 'CUS-046',
        cargo: [['tahong', 500]],
        freight: 5600,
        source: 'Messenger',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T05:10',
        req: '10:00',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '010',
        customerId: 'CUS-006',
        cargo: [['tahong', 700]],
        freight: 8050,
        source: 'Messenger',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T06:22',
        req: '10:00',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '011',
        customerId: 'CUS-007',
        cargo: [['tahong', 300]],
        freight: 3450,
        source: 'Messenger',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T06:35',
        req: '10:00',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '012',
        customerId: 'CUS-011',
        cargo: [
          ['tahong', 250],
          ['tilapia', 150],
        ],
        freight: 4600,
        source: 'Customer Portal',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T00:40',
        req: '09:00',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '013',
        customerId: 'CUS-010',
        cargo: [['bangus', 250]],
        freight: 2900,
        source: 'Phone',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T07:02',
        req: '09:00',
      },
    ],
    [
      D2,
      'outbound',
      {
        no: '014',
        customerId: 'CUS-019',
        cargo: [
          ['sugpo', 400],
          ['alimango', 150],
          ['hipon', 200],
        ],
        freight: 7900,
        source: 'Phone',
        status: 'Assigned',
        createdAt: '2026-09-24T18:15',
        req: '12:00',
      },
    ],
    [
      D2,
      'outbound',
      {
        no: '015',
        customerId: 'CUS-020',
        cargo: [
          ['sugpo', 150],
          ['alimango', 60],
          ['pusit', 80],
        ],
        freight: 3050,
        source: 'Messenger',
        status: 'Assigned',
        createdAt: '2026-09-24T20:50',
        req: '12:00',
        charges: [{ label: 'Re-icing en route', amount: 300 }],
      },
    ],
    [
      D2,
      'outbound',
      {
        no: '016',
        customerId: 'CUS-021',
        cargo: [
          ['tahong', 1500],
          ['bangus', 800],
          ['tilapia', 600],
        ],
        freight: 29000,
        source: 'Sales Staff',
        status: 'Assigned',
        createdAt: '2026-09-24T14:05',
        req: '15:00',
      },
    ],
    [
      D2,
      'outbound',
      {
        no: '017',
        customerId: 'CUS-023',
        cargo: [
          ['sugpo', 120],
          ['talaba', 100],
        ],
        freight: 2200,
        source: 'Messenger',
        status: 'Assigned',
        createdAt: '2026-09-25T05:45',
        req: '14:00',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '018',
        customerId: 'CUS-022',
        cargo: [
          ['sugpo', 90],
          ['talaba', 60],
        ],
        freight: 1800,
        source: 'Customer Portal',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-24T21:30',
        req: '13:00',
        notes: 'Weekend special — sugpo for Saturday lunch service.',
      },
    ],
    [
      undefined,
      'outbound',
      {
        no: '019',
        customerId: 'CUS-024',
        cargo: [['tahong', 700]],
        freight: 7000,
        source: 'Phone',
        status: 'Awaiting Dispatch',
        createdAt: '2026-09-25T06:58',
        req: '13:00',
      },
    ],
    [
      D2,
      'return',
      {
        no: '020',
        customerId: 'CUS-036',
        cargo: [
          ['cabbage', 500],
          ['carrots', 400],
        ],
        freight: 4500,
        source: 'Phone',
        status: 'Assigned',
        createdAt: '2026-09-25T06:00',
        req: '21:00',
        pickup: placeByName('Dasmariñas Vegetable Bagsakan')!,
      },
    ],
  ];
  for (const [trip, leg, s] of tmr) scripted(TOMORROW, trip, leg, s);
  companyLoad(TOMORROW, 'red-onion', 1200, VZ_DEPOT, D1.id, 'Assigned', '2026-09-25T07:25');
  for (const t of [D1, D2]) {
    t.stops = planStops(
      t,
      loads.filter((l) => l.tripId === t.id),
      ctx,
    );
    t.history = [{ at: '2026-09-25T07:20', label: 'Trip planned', by: DISPATCHER }];
    syncJobsWithStops(t);
    for (const job of jobs.filter((j) => j.tripId === t.id)) createDelivery(t, job, 'live');
  }

  // ─── Upcoming bookings (Mon Sep 28 / Tue Sep 29) ────────────────────────────
  const MON = '2026-09-28';
  const TUE = '2026-09-29';
  const BATANGAS_PORT = placeByName('Batangas Port — Isla Reefer handover')!;
  scripted(MON, undefined, 'outbound', {
    no: '001',
    customerId: 'CUS-041',
    cargo: [['niyog', 2500]],
    freight: 21400,
    source: 'Messenger',
    status: 'Confirmed',
    createdAt: '2026-09-24T11:20',
    req: '14:00',
    dropoff: {
      name: BATANGAS_PORT.name,
      areaId: BATANGAS_PORT.areaId,
      address: BATANGAS_PORT.address,
    },
    quoteId: 'QT-260923-001',
    notes: `${INTER_ISLAND_PARTNER.note}. Sea freight to Cebu billed separately by the partner. 50% down payment received.`,
  });
  scripted(MON, undefined, 'outbound', {
    no: '002',
    customerId: 'CUS-013',
    cargo: [
      ['sugpo', 120],
      ['talaba', 80],
    ],
    freight: 2400,
    source: 'Repeat Customer',
    status: 'Confirmed',
    createdAt: '2026-09-25T06:00',
    req: '11:00',
  });
  scripted(MON, undefined, 'outbound', {
    no: '003',
    customerId: 'CUS-030',
    cargo: [
      ['bangus', 1500],
      ['tilapia', 1000],
    ],
    freight: 19000,
    source: 'Sales Staff',
    status: 'Confirmed',
    createdAt: '2026-09-24T16:30',
    req: '12:00',
  });
  scripted(MON, undefined, 'outbound', {
    no: '004',
    customerId: 'CUS-033',
    cargo: [
      ['sugpo', 100],
      ['tahong', 80],
    ],
    freight: 1800,
    source: 'Repeat Customer',
    status: 'Confirmed',
    createdAt: '2026-09-25T06:00',
    req: '11:00',
  });
  scripted(TUE, undefined, 'return', {
    no: '001',
    customerId: 'CUS-052',
    cargo: [['frozen', 900]],
    freight: 4500,
    source: 'Messenger',
    status: 'Inquiry',
    createdAt: '2026-09-25T07:32',
    req: '22:00',
    pickup: placeByName('Caloocan Cold Storage Hub')!,
    notes: "Asked if Tuesday's Manila run can pick up 45 boxes of frozen goods.",
  });
  scripted(TUE, undefined, 'outbound', {
    no: '002',
    customerId: 'CUS-015',
    cargo: [
      ['sugpo', 600],
      ['bangus', 500],
    ],
    freight: 12650,
    source: 'Phone',
    status: 'Quoted',
    createdAt: '2026-09-24T14:40',
    req: '10:00',
    quoteId: 'QT-260924-001',
  });
  // The Cebu booking's 50% down payment was received before dispatch.

  // ─── Quotes ─────────────────────────────────────────────────────────────────
  function quote(q: Omit<FreightQuote, 'createdBy'> & { createdBy?: string }) {
    quotes.push({ createdBy: 'Kristine Ramos', ...q });
  }
  const genTri = customerById('CUS-029')!;
  quote({
    id: 'QT-260915-001',
    customerId: 'CUS-029',
    pickup: LUCENA_WAREHOUSE,
    dropoff: customerPlace(genTri),
    cargoDescription: 'Tahong + Bangus',
    cargoCategory: 'Shellfish',
    weightKg: 1200,
    truckRequirement: 'Insulated van, iced cargo',
    pickupDate: TODAY,
    requiredDate: TODAY,
    freightCharge: 12000,
    additionalCharges: [],
    validUntil: '2026-09-30',
    status: 'Accepted',
    createdAt: '2026-09-15T10:20',
    createdBy: 'Aileen Macaraeg',
    sentAt: '2026-09-15T10:45',
    respondedAt: '2026-09-25T06:15',
    jobId: 'JOB-260925-019',
    notes: 'Rate held for GenTri after Imus stop.',
  });
  quote({
    id: 'QT-260923-001',
    customerId: 'CUS-041',
    pickup: LUCENA_WAREHOUSE,
    dropoff: {
      name: BATANGAS_PORT.name,
      areaId: BATANGAS_PORT.areaId,
      address: BATANGAS_PORT.address,
    },
    cargoDescription: 'Niyog (mature coconut)',
    cargoCategory: 'Produce',
    weightKg: 2500,
    truckRequirement: 'Shared van (LTL)',
    pickupDate: MON,
    requiredDate: MON,
    freightCharge: 21400,
    additionalCharges: [],
    validUntil: '2026-09-30',
    status: 'Accepted',
    createdAt: '2026-09-23T09:10',
    sentAt: '2026-09-23T09:30',
    respondedAt: '2026-09-24T11:05',
    jobId: 'JOB-260928-001',
    notes:
      'Lucena → Batangas Port leg only. Sea freight Batangas → Cebu quoted separately by Isla Reefer Cargo Forwarders.',
  });
  const munoz = customerById('CUS-015')!;
  quote({
    id: 'QT-260924-001',
    customerId: 'CUS-015',
    pickup: LUCENA_WAREHOUSE,
    dropoff: customerPlace(munoz),
    cargoDescription: 'Sugpo + Bangus',
    cargoCategory: 'Seafood',
    weightKg: 1100,
    truckRequirement: 'Insulated van, iced cargo',
    pickupDate: TUE,
    requiredDate: TUE,
    freightCharge: 12650,
    additionalCharges: [],
    validUntil: '2026-09-27',
    status: 'Sent',
    createdAt: '2026-09-24T14:30',
    createdBy: 'Jerome Bautista',
    sentAt: '2026-09-24T14:40',
  });
  quote({
    id: 'QT-260924-002',
    leadId: 'LD-001',
    pickup: LUCENA_WAREHOUSE,
    dropoff: {
      name: 'JM Seafood Dealer',
      areaId: 'imus',
      address: 'Imus Public Market area, Imus',
    },
    cargoDescription: 'Sugpo (tiger prawn), iced',
    cargoCategory: 'Seafood',
    weightKg: 600,
    truckRequirement: 'Insulated van, iced cargo',
    pickupDate: '2026-10-01',
    requiredDate: '2026-10-01',
    freightCharge: 6000,
    additionalCharges: [{ label: 'Re-icing en route', amount: 300 }],
    validUntil: '2026-10-01',
    status: 'Sent',
    createdAt: '2026-09-23T15:00',
    createdBy: 'Aileen Macaraeg',
    sentAt: '2026-09-23T15:05',
    notes: 'Rate for 2 trips/week (Mon & Thu) on the Cavite run.',
  });
  const staRosa = customerById('CUS-031')!;
  quote({
    id: 'QT-260922-001',
    customerId: 'CUS-031',
    pickup: LUCENA_WAREHOUSE,
    dropoff: customerPlace(staRosa),
    cargoDescription: 'Sugpo + Talaba',
    cargoCategory: 'Seafood',
    weightKg: 320,
    truckRequirement: 'Insulated van, iced cargo',
    pickupDate: '2026-10-02',
    requiredDate: '2026-10-02',
    freightCharge: 2700,
    additionalCharges: [{ label: 'After-hours unloading', amount: 500 }],
    validUntil: '2026-10-02',
    status: 'Accepted',
    createdAt: '2026-09-22T11:00',
    createdBy: 'Aileen Macaraeg',
    sentAt: '2026-09-22T11:20',
    respondedAt: '2026-09-24T16:00',
    notes: 'Birthday event order — accepted, job not yet created.',
  });
  quote({
    id: 'QT-260918-001',
    leadId: 'LD-002',
    pickup: LUCENA_WAREHOUSE,
    dropoff: {
      name: "Rosa's Ihaw-Ihaw",
      areaId: 'quezon-city',
      address: 'Teachers Village, Quezon City',
    },
    cargoDescription: 'Tahong + Talaba',
    cargoCategory: 'Shellfish',
    weightKg: 180,
    truckRequirement: 'Shared van (LTL)',
    pickupDate: '2026-09-24',
    requiredDate: '2026-09-24',
    freightCharge: 2100,
    additionalCharges: [],
    validUntil: '2026-09-22',
    status: 'Rejected',
    createdAt: '2026-09-18T09:00',
    createdBy: 'Jerome Bautista',
    sentAt: '2026-09-18T09:20',
    respondedAt: '2026-09-21T13:00',
    rejectReason: 'Prefers to pick up with a hired L300 van — cheaper for 180 kg.',
  });
  const pansol = customerById('CUS-032')!;
  quote({
    id: 'QT-260910-001',
    customerId: 'CUS-032',
    pickup: LUCENA_WAREHOUSE,
    dropoff: customerPlace(pansol),
    cargoDescription: 'Sugpo + Bangus',
    cargoCategory: 'Seafood',
    weightKg: 400,
    truckRequirement: 'Insulated van, iced cargo',
    pickupDate: '2026-09-19',
    requiredDate: '2026-09-19',
    freightCharge: 3400,
    additionalCharges: [],
    validUntil: '2026-09-17',
    status: 'Expired',
    createdAt: '2026-09-10T15:40',
    createdBy: 'Aileen Macaraeg',
    sentAt: '2026-09-10T16:00',
  });
  quote({
    id: 'QT-260920-001',
    customerId: 'CUS-050',
    pickup: CALAMBA_FEEDS,
    dropoff: customerPlace(customerById('CUS-050')!),
    cargoDescription: 'Aquaculture feeds + Rice',
    cargoCategory: 'Dry Goods',
    weightKg: 2000,
    truckRequirement: 'Shared van (LTL)',
    pickupDate: '2026-10-05',
    requiredDate: '2026-10-05',
    freightCharge: 9000,
    additionalCharges: [],
    validUntil: '2026-09-27',
    status: 'Sent',
    createdAt: '2026-09-20T10:00',
    sentAt: '2026-09-20T10:30',
    notes: 'Proposed weekly backhaul slot every Monday (Cavite return via Calamba).',
  });
  quote({
    id: 'QT-260925-001',
    leadId: 'LD-005',
    pickup: LUCENA_WAREHOUSE,
    dropoff: {
      name: 'San Pablo Public Market',
      areaId: 'calamba',
      address: 'San Pablo City, Laguna',
    },
    cargoDescription: 'Tahong + Tilapia',
    cargoCategory: 'Shellfish',
    weightKg: 600,
    truckRequirement: 'Shared van (LTL)',
    pickupDate: '2026-10-06',
    requiredDate: '2026-10-06',
    freightCharge: 4800,
    additionalCharges: [],
    validUntil: '2026-10-09',
    status: 'Draft',
    createdAt: '2026-09-25T07:35',
  });
  quote({
    id: 'QT-260921-001',
    customerId: 'CUS-048',
    pickup: VZ_DEPOT,
    dropoff: customerPlace(customerById('CUS-048')!),
    cargoDescription: 'Red onion',
    cargoCategory: 'Produce',
    weightKg: 1200,
    truckRequirement: 'Shared van (LTL)',
    pickupDate: TODAY,
    requiredDate: TODAY,
    freightCharge: 6000,
    additionalCharges: [],
    validUntil: '2026-09-28',
    status: 'Accepted',
    createdAt: '2026-09-21T09:00',
    sentAt: '2026-09-21T09:10',
    respondedAt: '2026-09-21T12:00',
    jobId: 'JOB-260925-021',
  });
  jobIndex.get('JOB-260925-021')!.quoteId = 'QT-260921-001';

  // ─── Odometers, fuel logs and trip expenses ─────────────────────────────────
  trips.sort(
    (a, b) => a.departure.localeCompare(b.departure) || a.truckId.localeCompare(b.truckId),
  );
  for (const truck of TRUCKS) {
    const done = trips.filter((t) => t.truckId === truck.id && t.status === 'Completed').reverse();
    let odo = truck.mileageKm;
    for (const t of done) {
      t.odometerEnd = odo - rint(0, 3);
      t.odometerStart = t.odometerEnd - (routeById(t.routeId).roundTripKm + rint(-6, 14));
      odo = t.odometerStart;
    }
  }

  const dieselPrice = (date: string) => {
    const week = Math.floor((Date.parse(date) - Date.parse(START)) / (7 * 86400000));
    return [62.4, 63.1, 63.8, 62.9, 63.2][Math.min(4, Math.max(0, week))];
  };

  let fuelNo = 0;
  function fuel(
    trip: Trip,
    dt: string,
    odometerKm: number,
    liters: number,
    station: string,
    areaId: FuelLog['areaId'],
    fullTank: boolean,
  ) {
    const price = dieselPrice(trip.date);
    const log: FuelLog = {
      id: `FUEL-${pad(++fuelNo, 4)}`,
      truckId: trip.truckId,
      tripId: trip.id,
      driverId: trip.driverId,
      date: dt,
      odometerKm,
      liters,
      pricePerLiter: price,
      totalCost: Math.round(liters * price),
      station,
      areaId,
      fullTank,
      receiptRef: `SI-${rint(100000, 999999)}`,
    };
    fuelLogs.push(log);
    expenses.push({
      date: dt.slice(0, 10),
      category: 'Diesel',
      amount: log.totalCost,
      description: `${liters} L diesel @ ₱${price.toFixed(2)}/L${fullTank ? ' (full tank)' : ' (top-up)'}`,
      tripId: trip.id,
      truckId: trip.truckId,
      driverId: trip.driverId,
      fuelLogId: log.id,
      paidTo: station,
      recordedBy: ACCOUNTING,
      receiptRef: log.receiptRef,
    });
  }

  function tripExpenses(trip: Trip, mode: CostPlan['mode']) {
    const route = routeById(trip.routeId);
    const driver = driverById(trip.driverId);
    const tl = loads.filter((l) => l.tripId === trip.id && l.status !== 'Cancelled');
    const outKg = tl.filter((l) => l.leg === 'outbound').reduce((s, l) => s + l.weightKg, 0);
    const retKg = tl.filter((l) => l.leg === 'return').reduce((s, l) => s + l.weightKg, 0);
    const cap = truckById(trip.truckId).capacityKg;
    const ref = () => `CV-${yymmdd(trip.date)}-${rint(100, 999)}`;
    const add = (
      category: ExpenseCategory,
      amount: number,
      description: string,
      paidTo: string,
      date = trip.date,
    ) =>
      expenses.push({
        date,
        category,
        amount: Math.round(amount),
        description,
        tripId: trip.id,
        truckId: trip.truckId,
        driverId: trip.driverId,
        paidTo,
        recordedBy: ACCOUNTING,
        receiptRef: ref(),
      });
    const port = trip.stops.some((s) => s.location.areaId === 'navotas');
    add('Loading Fee', rint(10, 14) * 100, 'Bodega kargador — outbound loading', 'Bodega loaders');
    if (mode === 'loading') return;
    add('Driver Allowance', 1200, `Trip allowance — ${driver.name}`, driver.name);
    add(
      'Helper Allowance',
      700 * trip.helperIds.length,
      `${trip.helperIds.length} helpers × ₱700`,
      'Helpers',
    );
    if (mode === 'in-transit') {
      add(
        'Toll',
        Math.round(route.tollFee / 2),
        'SLEX / Skyway / NLEX — outbound, Class 3 RFID',
        'Toll RFID reload',
      );
      add('Meals', 450, 'Breakfast — driver & helpers', 'Various');
      if (port)
        add('Port Fee', 350, 'Navotas Fish Port gate & parking', 'Navotas Fish Port Complex');
      return;
    }
    add(
      'Toll',
      route.tollFee + rint(-40, 60),
      'SLEX / Skyway / NLEX — Class 3 RFID, round trip',
      'Toll RFID reload',
    );
    add('Meals', rint(9, 13) * 100, 'Driver & helpers meals', 'Various');
    if (port) add('Port Fee', 350, 'Navotas Fish Port gate & parking', 'Navotas Fish Port Complex');
    else if (chance(0.6))
      add('Parking', rint(1, 3) * 50 + 100, 'Street parking / market entry', 'Various');
    add(
      'Unloading Fee',
      port ? rint(18, 24) * 100 : rint(6, 12) * 100,
      port ? 'Fish port kargador fees' : 'Market kargador fees',
      'Kargador',
    );
    if (retKg > 0) add('Loading Fee', rint(4, 9) * 100, 'Kargador at backhaul pickup', 'Kargador');
    if (chance(0.05))
      add('Repair', pick([350, 450, 600]), 'Vulcanizing — spare tire', 'Roadside vulcanizing shop');
    if (chance(0.1)) add('Other', 300, 'Truck wash', 'Lucena truck wash');
    // Diesel: optional top-up on long runs, then full tank back in Lucena.
    const truck = truckById(trip.truckId);
    const km = trip.odometerEnd! - trip.odometerStart!;
    const eff =
      (truck.fuelEfficiencyKmPerL * rfloat(0.93, 1.04)) /
      (1 + 0.06 * ((outKg + retKg) / (2 * cap)));
    let litres = Math.round(km / eff);
    if (km > 320 && chance(0.35)) {
      const topUp = rint(60, 90);
      fuel(
        trip,
        plusMin(trip.actualDeparture!, 60 * 9),
        trip.odometerStart! + Math.round(km * 0.6),
        topUp,
        'Shell — SLEX Southbound, Calamba',
        'calamba',
        false,
      );
      litres -= topUp;
    }
    fuel(
      trip,
      plusMin(trip.actualReturn!, 15),
      trip.odometerEnd!,
      litres,
      'Petron — Diversion Rd., Lucena',
      'lucena',
      true,
    );
  }
  for (const p of costPlans) tripExpenses(p.trip, p.mode);
  // Today's in-transit extras already paid on the road.
  expenses.push({
    date: TODAY,
    category: 'Toll',
    amount: 120,
    description: 'STAR Tollway — Lipa exit re-route (flooded service road)',
    tripId: T02,
    truckId: 'TRK-02',
    driverId: 'DRV-02',
    paidTo: 'Toll RFID reload',
    recordedBy: ACCOUNTING,
    receiptRef: 'CV-260925-311',
  });
  expenses.pop();

  // Maintenance odometers follow the trip log (records inside the data window).
  const maintenance: MaintenanceRecord[] = MAINTENANCE.map((m) => ({ ...m }));
  for (const m of maintenance) {
    const truckTrips = trips
      .filter((t) => t.truckId === m.truckId && t.odometerStart !== undefined)
      .sort((a, b) => a.departure.localeCompare(b.departure));
    if (!truckTrips.length) continue;
    const firstStart = truckTrips[0].odometerStart!;
    const firstDate = truckTrips[0].date;
    if (m.status === 'Completed') {
      const before = truckTrips.filter((t) => t.date < m.date);
      m.odometerKm = before.length
        ? (before[before.length - 1].odometerEnd ?? before[before.length - 1].odometerStart!)
        : firstStart - Math.round(((Date.parse(firstDate) - Date.parse(m.date)) / 86400000) * 290);
      if (m.nextServiceKm && (m.type === 'Preventive Maintenance' || m.type === 'Oil Change'))
        m.nextServiceKm =
          Math.round((m.odometerKm + (m.truckId === 'TRK-01' ? 10000 : 5000)) / 50) * 50;
    } else {
      const current = truckById(m.truckId).mileageKm;
      m.odometerKm =
        current +
        Math.max(0, Math.round(((Date.parse(m.date) - Date.parse(TODAY)) / 86400000) * 290));
    }
  }

  // ─── Payments ───────────────────────────────────────────────────────────────
  const maskRef = (method: PaymentMethod) => {
    const tail = pad(rint(0, 9999), 4);
    switch (method) {
      case 'GCash':
        return `GCash Ref •••• ${tail}`;
      case 'Maya':
        return `Maya Ref •••• ${tail}`;
      case 'Bank Transfer':
        return `Bank Ref •••• ${tail}`;
      case 'Check':
        return `Check No. •••${tail.slice(1)}`;
      case 'COD':
        return 'Cash collected by driver';
      default:
        return 'Cash — OR copy on file';
    }
  };
  function pay(
    j: LogisticsJob,
    amount: number,
    date: string,
    method: PaymentMethod,
    notes?: string,
  ) {
    if (date > NOW || amount <= 0) return;
    rawPayments.push({
      customerId: j.customerId,
      invoiceId: invoiceIdForJob(j.id),
      jobId: j.id,
      amount: Math.round(amount),
      method,
      reference: maskRef(method),
      date,
      recordedBy: ACCOUNTING,
      notes,
    });
  }
  for (const { job, paid, paidOn } of openingJobs)
    if (paid && paidOn)
      pay(job, paid, at(paidOn, '10:30'), 'Bank Transfer', 'Partial settlement of opening balance');
  for (const j of jobs) {
    if (j.notes === GO_LIVE_NOTE || !isBillableJob(j) || !j.deliveredAt) continue;
    const c = customerById(j.customerId)!;
    const total = jobTotal(j);
    const issue = j.deliveredAt.slice(0, 10);
    const due = addDaysISO(issue, termsDays(j.paymentTerms));
    const trip = trips.find((t) => t.id === j.tripId);
    const collector = trip ? driverById(trip.driverId).name : undefined;
    if (j.paymentTerms === 'COD') {
      const method: PaymentMethod = chance(0.5)
        ? 'COD'
        : chance(0.7)
          ? 'GCash'
          : chance(0.5)
            ? 'Maya'
            : 'Cash';
      if (j.deliveredAt >= TODAY) continue;
      if (c.paymentBehavior === 'average' && chance(0.15)) {
        const first = Math.round((total * 0.6) / 100) * 100;
        pay(
          j,
          first,
          j.deliveredAt,
          method,
          method === 'COD' && collector ? `Partial — remitted by ${collector}` : 'Partial payment',
        );
        pay(
          j,
          total - first,
          at(addDaysISO(issue, rint(2, 6)), '09:15'),
          'GCash',
          'Balance settled on next booking',
        );
      } else
        pay(
          j,
          total,
          j.deliveredAt,
          method,
          method === 'COD' && collector ? `Remitted by ${collector}` : undefined,
        );
    } else if (j.paymentTerms === '50% Down, Balance on Arrival') {
      const dp = Math.round(total / 2);
      pay(j, dp, plusMin(j.createdAt, rint(60, 240)), 'Bank Transfer', '50% down payment');
      pay(j, total - dp, at(due, '11:00'), 'Bank Transfer', 'Balance on arrival');
    } else if (isCreditTerms(j.paymentTerms)) {
      const offset = {
        prompt: rint(-3, 1),
        average: rint(-1, 7),
        slow: rint(4, 20),
        delinquent: rint(14, 48),
      }[c.paymentBehavior];
      let payDate = addDaysISO(due, offset);
      if (payDate <= issue) payDate = addDaysISO(issue, 1);
      const method: PaymentMethod = chance(0.55)
        ? 'Bank Transfer'
        : chance(0.6)
          ? 'Check'
          : 'GCash';
      const when = at(payDate, `${pad(rint(9, 16), 2)}:${pad(rint(0, 59), 2)}`);
      if (c.paymentBehavior === 'delinquent' && chance(0.5))
        pay(
          j,
          Math.round((total * 0.5) / 100) * 100,
          when,
          method,
          'Partial — balance promised next week',
        );
      else pay(j, total, when, method);
    }
  }
  // The Cebu booking's 50% down payment (job not yet delivered, so held as an advance on its invoice number).
  {
    const cebu = jobIndex.get('JOB-260928-001')!;
    pay(
      cebu,
      Math.round(jobTotal(cebu) / 2),
      '2026-09-24T15:10',
      'Bank Transfer',
      '50% down payment — before Batangas Port handover',
    );
  }
  rawPayments.sort((a, b) => a.date.localeCompare(b.date));
  const paySeq = new Map<string, number>();
  const payments: Payment[] = rawPayments.map((p, i) => {
    const day = p.date.slice(0, 10);
    const n = (paySeq.get(day) ?? 0) + 1;
    paySeq.set(day, n);
    return { ...p, id: `PAY-${yymmdd(day)}-${pad(n)}`, receiptNo: `OR-${pad(5200 + i, 6)}` };
  });

  const finalExpenses: Expense[] = expenses
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e, i) => ({ ...e, id: `EXP-${pad(i + 1, 5)}` }))
    .reverse();

  // ─── Customer lifetime baselines (freight before the 30-day window) ─────────
  const windowRevenue = new Map<string, number>();
  for (const j of jobs)
    if (isBillableJob(j) && j.notes !== GO_LIVE_NOTE)
      windowRevenue.set(j.customerId, (windowRevenue.get(j.customerId) ?? 0) + jobTotal(j));
  const LIFETIME_BASELINE: Record<string, number> = {};
  for (const c of CUSTOMERS) {
    const months = Math.max(0, (Date.parse(START) - Date.parse(c.customerSince)) / (30 * 86400000));
    LIFETIME_BASELINE[c.id] =
      Math.round(((windowRevenue.get(c.id) ?? 0) * months * rfloat(0.6, 0.9)) / 1000) * 1000;
  }

  // ─── Notifications (computed from the generated data) ───────────────────────
  const invoices = getInvoices(jobs, payments);
  const rjmOverdue = invoices
    .filter((i) => i.customerId === 'CUS-002' && i.daysOverdue > 0)
    .reduce((s, i) => s + i.balance, 0);
  const t02Return = loads
    .filter((l) => l.tripId === T02 && l.leg === 'return')
    .reduce((s, l) => s + l.weightKg, 0);
  const t01Return = loads
    .filter((l) => l.tripId === T01 && l.leg === 'return')
    .reduce((s, l) => s + l.weightKg, 0);
  const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
  const kgs = (n: number) => `${n.toLocaleString('en-PH')} kg`;

  const notifications: AppNotification[] = [
    {
      id: 'N-01',
      kind: 'delivery',
      title: 'First drop delivered',
      body: 'JOB-260925-001 delivered to Navotas Prime Seafood Supply — POD captured by Joel Mendoza.',
      at: '2026-09-25T07:29',
      href: '/deliveries/DLV-260925-001',
      severity: 'success',
      read: false,
      roles: ['owner', 'dispatcher', 'sales'],
    },
    {
      id: 'N-02',
      kind: 'trip',
      title: 'Truck 01 departed Lucena',
      body: `${T01} left the bodega at 3:34 AM with 7,250 kg for Navotas and Valenzuela.`,
      at: '2026-09-25T03:34',
      href: `/trips/${T01}`,
      severity: 'info',
      read: true,
      roles: ['owner', 'dispatcher'],
    },
    {
      id: 'N-03',
      kind: 'finance',
      title: 'Overdue freight balance',
      body: `RJM Seafood Trading has ${peso(rjmOverdue)} overdue freight.`,
      at: '2026-09-25T07:00',
      href: '/customers/CUS-002',
      severity: 'critical',
      read: false,
      roles: ['owner', 'accounting', 'sales'],
    },
    {
      id: 'N-04',
      kind: 'delivery',
      title: 'Late delivery risk',
      body: "Truck 01 is running ~20 min behind. Kuya Boyet's Fish Stall (receiving until 9:00 AM) is at risk.",
      at: '2026-09-25T07:40',
      href: '/deliveries/DLV-260925-005',
      severity: 'warning',
      read: false,
      roles: ['owner', 'dispatcher', 'sales'],
    },
    {
      id: 'N-05',
      kind: 'backhaul',
      title: 'Unused return capacity',
      body: `Truck 02 has ${kgs(truckById('TRK-02').capacityKg - t02Return)} unused return capacity on ${T02}.`,
      at: '2026-09-25T07:20',
      href: '/backhaul',
      severity: 'info',
      read: false,
      roles: ['owner', 'dispatcher'],
    },
    {
      id: 'N-06',
      kind: 'backhaul',
      title: 'Backhaul opportunity',
      body: `JOB-260925-021 (1,200 kg red onion, Valenzuela → Tayabas) fits Truck 01's return leg — ${kgs(truckById('TRK-01').capacityKg - t01Return)} free.`,
      at: '2026-09-25T07:22',
      href: '/jobs/JOB-260925-021',
      severity: 'info',
      read: false,
      roles: ['owner', 'dispatcher'],
    },
    {
      id: 'N-07',
      kind: 'job',
      title: 'Job awaiting dispatch',
      body: 'GenTri Seafood Hub booked 1,200 kg for today (JOB-260925-019). Truck 02 departs 9:00 AM.',
      at: '2026-09-25T06:21',
      href: '/dispatch',
      severity: 'warning',
      read: false,
      roles: ['owner', 'dispatcher', 'sales'],
    },
    {
      id: 'N-08',
      kind: 'job',
      title: 'Credit hold',
      body: 'JOB-260926-007 (RJM Seafood Trading) is on credit hold pending approval.',
      at: '2026-09-25T07:06',
      href: '/jobs/JOB-260926-007',
      severity: 'warning',
      read: false,
      roles: ['owner', 'accounting', 'sales'],
    },
    {
      id: 'N-09',
      kind: 'fleet',
      title: 'Fish port gate pass expired',
      body: "Truck 02's Navotas Fish Port gate pass expired Sep 20. Renew before assigning Navotas drops.",
      at: '2026-09-25T06:00',
      href: '/documents',
      severity: 'critical',
      read: false,
      roles: ['owner', 'dispatcher'],
    },
    {
      id: 'N-10',
      kind: 'fleet',
      title: 'Maintenance overdue',
      body: 'Truck 01 tire rotation (scheduled Sep 21) has not been done.',
      at: '2026-09-25T06:00',
      href: '/maintenance',
      severity: 'warning',
      read: false,
      roles: ['owner', 'dispatcher'],
    },
    {
      id: 'N-11',
      kind: 'lead',
      title: 'New Facebook lead',
      body: 'Sta. Cruz Agri Hub asked about hauling onions Balintawak → Santa Cruz (≈3 tons/week).',
      at: '2026-09-25T07:02',
      href: '/leads',
      severity: 'info',
      read: false,
      roles: ['owner', 'sales'],
    },
    {
      id: 'N-12',
      kind: 'job',
      title: 'New inquiry',
      body: 'Lucena Frozen Goods Depot asked for 900 kg pickup from Caloocan on Tuesday (JOB-260929-001).',
      at: '2026-09-25T07:33',
      href: '/jobs/JOB-260929-001',
      severity: 'info',
      read: false,
      roles: ['owner', 'sales', 'dispatcher'],
    },
  ];

  jobs.sort((a, b) => b.id.localeCompare(a.id));
  loads.sort((a, b) => b.id.localeCompare(a.id));
  fuelLogs.sort((a, b) => b.date.localeCompare(a.date));

  return {
    jobs,
    loads,
    trips,
    deliveries,
    quotes,
    payments,
    expenses: finalExpenses,
    fuelLogs,
    maintenance,
    notifications,
    lifetimeBaseline: LIFETIME_BASELINE,
  };
}

export type LogisticsSeed = ReturnType<typeof generateLogisticsSeed>;
