// GENERATED from trade-route-frontend/lib/logistics.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
/**
 * Logistics calculations shared by the API (commands, seed), the store and the UI.
 * Everything here is pure: pass in records, get derived values back.
 */
import { addMinutes, differenceInCalendarDays, differenceInMinutes, format, parseISO } from "date-fns";
import type {
  AreaId,
  Customer,
  Delivery,
  DeliveryStatus,
  Driver,
  Expense,
  FuelLog,
  Invoice,
  Load,
  LogisticsJob,
  MaintenanceRecord,
  Payment,
  PaymentStatus,
  Place,
  StopType,
  Trip,
  TripStatus,
  TripStop,
  Truck,
  TruckStatus,
  VehicleDocument,
} from "../types";
import { TODAY } from "../data/company";
import { areaById, LUCENA_WAREHOUSE, placeByName, routeById } from "../data/areas";
import { truckById, driverUnavailability } from "../data/fleet";
import { agingBucket, isCreditTerms, termsDays, type AgingBucket } from "./calc";
import { memoizeLast, sumBy } from "./collections";

const fmt = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const plus = (dt: string, m: number) => fmt(addMinutes(parseISO(dt), m));

// ─── Status groups ──────────────────────────────────────────────────────────
export const ACTIVE_TRIP_STATUSES: TripStatus[] = ["Loading", "Ready", "Dispatched", "In Transit", "Returning"];
/** Trips whose cargo can still be changed by the dispatcher. */
export const isTripEditable = (t: Pick<Trip, "status">) => t.status === "Planned" || t.status === "Loading" || t.status === "Ready";
/** Return-leg cargo can still be added while the truck is out. */
export const canAddReturnCargo = (t: Pick<Trip, "status">) => isTripEditable(t) || t.status === "Dispatched" || t.status === "In Transit";
export const isOpenJob = (j: Pick<LogisticsJob, "status">) => j.status === "Confirmed" || j.status === "Awaiting Dispatch";
export const isBillableJob = (j: Pick<LogisticsJob, "status">) => j.status === "Delivered" || j.status === "Completed";
export const DELIVERY_DONE: DeliveryStatus[] = ["Delivered", "Failed", "Returned"];

// ─── Money ──────────────────────────────────────────────────────────────────
export const additionalTotal = (j: Pick<LogisticsJob, "additionalCharges">) => sumBy(j.additionalCharges, (c) => c.amount);
export const jobTotal = (j: Pick<LogisticsJob, "freightCharge" | "additionalCharges">) => j.freightCharge + additionalTotal(j);

// ─── Places ─────────────────────────────────────────────────────────────────
export const isWarehouse = (p: Place) => p.name === LUCENA_WAREHOUSE.name;
/** Customer drop-off point as a Place. */
export function customerPlace(c: Customer, addressId?: string): Place {
  const a = c.addresses.find((x) => x.id === addressId) ?? c.addresses[0];
  return { name: c.name, areaId: a.areaId, address: `${a.line1}, ${a.barangay !== "—" ? `${a.barangay}, ` : ""}${a.city}` };
}

// ─── Stop planning ──────────────────────────────────────────────────────────
const QUEZON_DROP_ORDER: AreaId[] = ["candelaria", "sariaya", "tayabas", "pagbilao", "lucena"];
const SERVICE_MIN: Record<StopType, number> = { Pickup: 30, Delivery: 20, "Backhaul Pickup": 45, Fuel: 15, Port: 45, Warehouse: 30, Other: 20 };

export function travelMinutes(from: AreaId, to: AreaId) {
  if (from === to) return 10;
  const a = areaById(from);
  const b = areaById(to);
  return Math.max(15, Math.abs(a.driveMinutes - b.driveMinutes)) + 20;
}

interface StopContext {
  job: (id: string) => LogisticsJob | undefined;
  customer: (id: string) => Customer | undefined;
}

interface Draft {
  key: string;
  type: StopType;
  location: Place;
  customerId?: string;
  contactName?: string;
  contactPhone?: string;
  loaded: string[];
  unloaded: string[];
  order: number;
}

function stopKey(type: StopType, location: Place, customerId?: string, edge?: "start" | "end") {
  return edge ? `Warehouse|${edge}` : `${type}|${location.name}|${customerId ?? ""}`;
}

function contactFor(load: Load, ctx: StopContext, forDrop: boolean) {
  const job = load.jobId ? ctx.job(load.jobId) : undefined;
  if (forDrop && job) return { name: job.consignee.name, phone: job.consignee.phone };
  const c = load.customerId ? ctx.customer(load.customerId) : undefined;
  const p = c?.contacts.find((x) => x.primary) ?? c?.contacts[0];
  return p ? { name: p.name, phone: p.phone } : undefined;
}

/**
 * Build the ordered stop list for a trip from the loads assigned to it:
 * Lucena warehouse (loading) → outbound pickups → deliveries → backhaul pickups →
 * Quezon drops → Lucena warehouse (unload). Actual times and non-cargo stops (fuel,
 * port, other) from `existing` are kept; remaining ETAs are recalculated from progress.
 */
export function planStops(trip: Pick<Trip, "id" | "routeId" | "departure" | "actualDeparture">, tripLoads: Load[], ctx: StopContext, existing: TripStop[] = []): TripStop[] {
  const route = routeById(trip.routeId);
  const loads = tripLoads.filter((l) => l.status !== "Cancelled");
  const drafts = new Map<string, Draft>();
  const upsert = (key: string, init: Omit<Draft, "key" | "loaded" | "unloaded">) => {
    let d = drafts.get(key);
    if (!d) {
      d = { key, loaded: [], unloaded: [], ...init };
      drafts.set(key, d);
    }
    return d;
  };
  const outIdx = (a: AreaId) => {
    const i = route.outboundAreas.indexOf(a);
    return i === -1 ? route.outboundAreas.length : i;
  };
  const retIdx = (a: AreaId) => {
    const i = route.returnAreas.indexOf(a);
    return i === -1 ? route.returnAreas.length : i;
  };

  upsert("Warehouse|start", { type: "Warehouse", location: LUCENA_WAREHOUSE, order: 0 });
  for (const l of loads) {
    const job = l.jobId ? ctx.job(l.jobId) : undefined;
    const due = job ? parseISO(job.requiredBy).getTime() / 1e10 : 0;
    if (l.leg === "outbound") {
      if (isWarehouse(l.pickup)) drafts.get("Warehouse|start")!.loaded.push(l.id);
      else {
        const c = contactFor(l, ctx, false);
        upsert(stopKey("Pickup", l.pickup), { type: "Pickup", location: l.pickup, contactName: c?.name, contactPhone: c?.phone, order: 100 + (5 - Math.min(5, areaById(l.pickup.areaId).distanceKm / 10)) }).loaded.push(l.id);
      }
      const isPort = placeByName(l.destination.name)?.kinds.includes("port");
      const type: StopType = isPort ? "Port" : "Delivery";
      const c = contactFor(l, ctx, true);
      upsert(stopKey(type, l.destination, l.customerId), { type, location: l.destination, customerId: l.customerId, contactName: c?.name, contactPhone: c?.phone, order: 1000 + outIdx(l.destination.areaId) * 10 + due }).unloaded.push(l.id);
    } else {
      const c = contactFor(l, ctx, false);
      upsert(stopKey("Backhaul Pickup", l.pickup), { type: "Backhaul Pickup", location: l.pickup, contactName: c?.name, contactPhone: c?.phone, order: 2000 + retIdx(l.pickup.areaId) * 10 }).loaded.push(l.id);
      if (isWarehouse(l.destination)) continue;
      const dc = contactFor(l, ctx, true);
      const qi = QUEZON_DROP_ORDER.indexOf(l.destination.areaId);
      upsert(stopKey("Delivery", l.destination, l.customerId), { type: "Delivery", location: l.destination, customerId: l.customerId, contactName: dc?.name, contactPhone: dc?.phone, order: 3000 + (qi === -1 ? 9 : qi) * 10 + due }).unloaded.push(l.id);
    }
  }
  const end = upsert("Warehouse|end", { type: "Warehouse", location: LUCENA_WAREHOUSE, order: 9000 });
  for (const l of loads) if (l.leg === "return" && isWarehouse(l.destination)) end.unloaded.push(l.id);

  const ordered = [...drafts.values()].sort((a, b) => a.order - b.order);

  // Re-insert non-cargo stops (fuel, port calls, other) after the stop they followed.
  const existingKeyed = existing.map((s, i) => ({ s, key: keyOfExisting(s, i, existing.length) }));
  const extras = existingKeyed.filter(({ s }) => s.loaded.length === 0 && s.unloaded.length === 0 && s.type !== "Warehouse" && (s.type === "Fuel" || s.type === "Other" || (s.type === "Port" && !s.customerId)));
  const byKey = new Map(existingKeyed.map((e) => [e.key, e.s]));
  type Row = { key: string; draft?: Draft; extra?: TripStop };
  const rows: Row[] = ordered.map((d) => ({ key: d.key, draft: d }));
  for (const ex of extras) {
    const idx = existing.indexOf(ex.s);
    const prevKey = idx > 0 ? existingKeyed[idx - 1].key : undefined;
    const at = prevKey ? rows.findIndex((r) => r.key === prevKey) : -1;
    rows.splice(at >= 0 ? at + 1 : Math.max(1, rows.length - 1), 0, { key: ex.key, extra: ex.s });
  }

  // Timing: walk the stops, anchoring on recorded actuals.
  let clock = trip.actualDeparture ?? trip.departure;
  let prevArea: AreaId = "lucena";
  return rows.map((row, i) => {
    const prev = byKey.get(row.key);
    const type = row.draft?.type ?? row.extra!.type;
    const location = row.draft?.location ?? row.extra!.location;
    let plannedArrival: string;
    let plannedDeparture: string;
    if (i === 0) {
      plannedArrival = plus(trip.departure, -60);
      plannedDeparture = trip.departure;
      clock = prev?.actualDeparture ?? trip.actualDeparture ?? trip.departure;
    } else if (prev && (prev.status === "Completed" || prev.status === "Arrived" || prev.status === "Skipped")) {
      plannedArrival = prev.plannedArrival;
      plannedDeparture = prev.plannedDeparture;
      clock = prev.actualDeparture ?? plus(prev.actualArrival ?? prev.plannedArrival, SERVICE_MIN[type]);
    } else {
      plannedArrival = plus(clock, travelMinutes(prevArea, location.areaId));
      plannedDeparture = plus(plannedArrival, SERVICE_MIN[type]);
      clock = plannedDeparture;
    }
    prevArea = location.areaId;
    const seq = i + 1;
    const base: TripStop = {
      id: `${trip.id}-S${String(seq).padStart(2, "0")}`,
      seq,
      type,
      location,
      customerId: row.draft?.customerId ?? row.extra?.customerId,
      contactName: row.draft?.contactName ?? row.extra?.contactName,
      contactPhone: row.draft?.contactPhone ?? row.extra?.contactPhone,
      plannedArrival,
      plannedDeparture,
      loaded: row.draft?.loaded ?? [],
      unloaded: row.draft?.unloaded ?? [],
      status: "Pending",
    };
    if (prev) {
      base.actualArrival = prev.actualArrival;
      base.actualDeparture = prev.actualDeparture;
      base.status = prev.status;
      base.notes = prev.notes;
    }
    return base;
  });
}

function keyOfExisting(s: TripStop, i: number, n: number) {
  if (s.type === "Warehouse" && i === 0) return "Warehouse|start";
  if (s.type === "Warehouse" && i === n - 1) return "Warehouse|end";
  if (s.type === "Fuel" || s.type === "Other" || (s.type === "Port" && !s.customerId)) return `${s.type}|${s.location.name}|${s.plannedArrival}`;
  return stopKey(s.type, s.location, s.customerId);
}

/** The stop where a load comes off the truck (delivery stop or final warehouse). */
export const dropStopFor = (trip: Trip, loadIds: string[]) => trip.stops.find((s) => s.unloaded.some((id) => loadIds.includes(id)));

/** Next stop the truck is heading to, and the last one it finished. */
export function tripProgress(trip: Trip) {
  const current = trip.stops.find((s) => s.status === "Arrived");
  const next = trip.stops.find((s) => s.status === "Pending");
  const done = trip.stops.filter((s) => s.status === "Completed" || s.status === "Skipped");
  const last = done[done.length - 1];
  return { current, next, last, done: done.length, total: trip.stops.length };
}

/** Human description of where a truck is, from its latest stop events (no GPS). */
export function truckLocation(trip: Trip | undefined): { label: string; detail?: string } {
  if (!trip || trip.status === "Completed" || trip.status === "Cancelled" || trip.status === "Planned") return { label: LUCENA_WAREHOUSE.name, detail: trip?.status === "Completed" ? `Returned ${trip.actualReturn ? format(parseISO(trip.actualReturn), "h:mm a") : ""}` : "Parked at the bodega" };
  if (trip.status === "Loading" || trip.status === "Ready") return { label: LUCENA_WAREHOUSE.name, detail: trip.status === "Loading" ? "Loading cargo" : "Loaded, waiting to depart" };
  const { current, next, last } = tripProgress(trip);
  if (current) return { label: `At ${current.location.name}`, detail: current.actualArrival ? `Arrived ${format(parseISO(current.actualArrival), "h:mm a")}` : undefined };
  if (next) return { label: `En route to ${next.location.name}`, detail: last ? `Last stop: ${last.location.name}${last.actualDeparture ? ` (left ${format(parseISO(last.actualDeparture), "h:mm a")})` : ""}` : undefined };
  return { label: "Returning to Lucena" };
}

// ─── Trip metrics ───────────────────────────────────────────────────────────
export interface TripMetrics {
  capacityKg: number;
  loads: Load[];
  outboundLoads: Load[];
  returnLoads: Load[];
  jobs: LogisticsJob[];
  deliveries: Delivery[];
  expenses: Expense[];
  outboundKg: number;
  returnKg: number;
  outUtil: number;
  retUtil: number;
  companyReturnKg: number;
  paidReturnKg: number;
  freightRevenue: number;
  additionalCharges: number;
  revenue: number;
  expenseTotal: number;
  /** True once a diesel fill-up has been logged for the trip. */
  dieselLogged: boolean;
  /** Planning estimate used until diesel is logged. */
  estimatedDiesel: number;
  /** Revenue − logged expenses (− estimated diesel if not yet logged). */
  contribution: number;
  companyCargoValue: number;
  plannedKm: number;
  distanceKm: number;
  distanceIsActual: boolean;
  loadedKm: number;
  emptyKm: number;
  costPerKm: number;
  delivered: number;
  deliveryCount: number;
}

export const DEMO_DIESEL_PRICE = 63.2;

export const getTripMetricsMap = memoizeLast((trips: Trip[], jobs: LogisticsJob[], loads: Load[], deliveries: Delivery[], expenses: Expense[]) => {
  const loadsByTrip = new Map<string, Load[]>();
  const jobWeight = new Map<string, number>();
  for (const l of loads) {
    if (l.status === "Cancelled") continue;
    if (l.jobId) jobWeight.set(l.jobId, (jobWeight.get(l.jobId) ?? 0) + l.weightKg);
    if (l.tripId) (loadsByTrip.get(l.tripId) ?? loadsByTrip.set(l.tripId, []).get(l.tripId)!).push(l);
  }
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const dlByTrip = new Map<string, Delivery[]>();
  for (const d of deliveries) (dlByTrip.get(d.tripId) ?? dlByTrip.set(d.tripId, []).get(d.tripId)!).push(d);
  const expByTrip = new Map<string, Expense[]>();
  for (const e of expenses) if (e.tripId) (expByTrip.get(e.tripId) ?? expByTrip.set(e.tripId, []).get(e.tripId)!).push(e);

  const out = new Map<string, TripMetrics>();
  for (const t of trips) {
    const truck = truckById(t.truckId);
    const cap = truck.capacityKg;
    const tl = loadsByTrip.get(t.id) ?? [];
    const outboundLoads = tl.filter((l) => l.leg === "outbound");
    const returnLoads = tl.filter((l) => l.leg === "return");
    const tripJobIds = [...new Set(tl.map((l) => l.jobId).filter((x): x is string => !!x))];
    const tripJobs = tripJobIds.map((id) => jobMap.get(id)).filter((j): j is LogisticsJob => !!j && j.status !== "Cancelled");
    let freightRevenue = 0;
    let additional = 0;
    for (const j of tripJobs) {
      const onTrip = sumBy(tl.filter((l) => l.jobId === j.id), (l) => l.weightKg);
      const share = onTrip / Math.max(1, jobWeight.get(j.id) ?? onTrip);
      freightRevenue += j.freightCharge * share;
      additional += additionalTotal(j) * share;
    }
    const ex = expByTrip.get(t.id) ?? [];
    const expenseTotal = sumBy(ex, (e) => e.amount);
    const dieselLogged = ex.some((e) => e.category === "Diesel");
    const route = routeById(t.routeId);
    const plannedKm = route.roundTripKm;
    const distanceIsActual = t.odometerStart !== undefined && t.odometerEnd !== undefined;
    const distanceKm = distanceIsActual ? t.odometerEnd! - t.odometerStart! : plannedKm;
    const outboundKg = sumBy(outboundLoads, (l) => l.weightKg);
    const returnKg = sumBy(returnLoads, (l) => l.weightKg);
    const leg = distanceKm / 2;
    const loadedKm = (outboundKg > 0 ? leg : 0) + (returnKg > 0 ? leg : 0);
    const estimatedDiesel = dieselLogged || t.status === "Cancelled" ? 0 : Math.round((plannedKm / truck.fuelEfficiencyKmPerL) * DEMO_DIESEL_PRICE);
    const revenue = Math.round(freightRevenue + additional);
    const dls = (dlByTrip.get(t.id) ?? []).sort((a, b) => a.eta.localeCompare(b.eta));
    out.set(t.id, {
      capacityKg: cap,
      loads: tl,
      outboundLoads,
      returnLoads,
      jobs: tripJobs,
      deliveries: dls,
      expenses: ex,
      outboundKg,
      returnKg,
      outUtil: outboundKg / cap,
      retUtil: returnKg / cap,
      companyReturnKg: sumBy(returnLoads.filter((l) => l.type === "Company-Owned"), (l) => l.weightKg),
      paidReturnKg: sumBy(returnLoads.filter((l) => l.type !== "Company-Owned"), (l) => l.weightKg),
      freightRevenue: Math.round(freightRevenue),
      additionalCharges: Math.round(additional),
      revenue,
      expenseTotal,
      dieselLogged,
      estimatedDiesel,
      contribution: revenue - expenseTotal - estimatedDiesel,
      companyCargoValue: sumBy(tl.filter((l) => l.type === "Company-Owned"), (l) => l.estimatedValue ?? 0),
      plannedKm,
      distanceKm,
      distanceIsActual,
      loadedKm,
      emptyKm: distanceKm - loadedKm,
      costPerKm: (expenseTotal + estimatedDiesel) / Math.max(1, distanceKm),
      delivered: dls.filter((d) => d.status === "Delivered").length,
      deliveryCount: dls.length,
    });
  }
  return out;
});

export interface TripWarning {
  kind: "capacity" | "driver" | "maintenance" | "conflict" | "document";
  message: string;
}

/** Dispatch warnings for a trip: capacity, crew availability, truck downtime and double-booking. */
export function tripWarnings(trip: Trip, m: TripMetrics | undefined, trips: Trip[], maintenance: MaintenanceRecord[], documents: VehicleDocument[] = []): TripWarning[] {
  const out: TripWarning[] = [];
  const truck = truckById(trip.truckId);
  if (m && m.outboundKg > m.capacityKg) out.push({ kind: "capacity", message: `Outbound capacity exceeded by ${Math.round(m.outboundKg - m.capacityKg).toLocaleString("en-PH")} kg` });
  if (m && m.returnKg > m.capacityKg) out.push({ kind: "capacity", message: `Return capacity exceeded by ${Math.round(m.returnKg - m.capacityKg).toLocaleString("en-PH")} kg` });
  if (trip.status === "Completed" || trip.status === "Cancelled") return out;
  const off = driverUnavailability(trip.driverId, trip.date);
  if (off) out.push({ kind: "driver", message: `Driver unavailable — ${off.reason}` });
  if (truck.outOfService) out.push({ kind: "maintenance", message: `${truck.code} is marked out of service` });
  const shop = maintenance.find((r) => r.truckId === trip.truckId && (r.status === "In Progress" || (r.status === "Scheduled" && r.date === trip.date)));
  if (shop) out.push({ kind: "maintenance", message: `Truck under maintenance — ${shop.type} (${shop.vendor})` });
  const clash = trips.find((o) => o.id !== trip.id && o.date === trip.date && o.status !== "Cancelled" && (o.truckId === trip.truckId || o.driverId === trip.driverId));
  if (clash) out.push({ kind: "conflict", message: `Schedule conflict with ${clash.id} (${clash.truckId === trip.truckId ? "same truck" : "same driver"})` });
  const gatePass = documents.find((d) => d.truckId === trip.truckId && d.type === "Fish Port Gate Pass");
  if (gatePass && gatePass.expiryDate < trip.date && trip.stops.some((s) => s.location.areaId === "navotas")) out.push({ kind: "document", message: "Fish port gate pass expired — Navotas port drops at risk" });
  return out;
}

// ─── Fleet status ───────────────────────────────────────────────────────────
/** Today's trip for a truck: the active one, else the next planned, else today's completed trip. */
export function truckTripToday(truckId: string, trips: Trip[], date = TODAY) {
  const mine = trips.filter((t) => t.truckId === truckId && t.status !== "Cancelled");
  return (
    mine.find((t) => ACTIVE_TRIP_STATUSES.includes(t.status)) ??
    mine.filter((t) => t.date === date && t.status === "Planned").sort((a, b) => a.departure.localeCompare(b.departure))[0] ??
    mine.find((t) => t.date === date)
  );
}

export function truckStatus(truck: Truck, trips: Trip[], maintenance: MaintenanceRecord[], date = TODAY): TruckStatus {
  if (truck.outOfService) return "Out of Service";
  if (maintenance.some((r) => r.truckId === truck.id && (r.status === "In Progress" || (r.status === "Scheduled" && r.date === date)))) return "Maintenance";
  const t = truckTripToday(truck.id, trips, date);
  if (!t) return "Available";
  if (t.status === "Loading" || t.status === "Ready") return "Loading";
  if (t.status === "Dispatched" || t.status === "In Transit" || t.status === "Returning") return "On Trip";
  if (t.status === "Planned") return "Assigned";
  return "Available";
}

export type DriverStatus = "On Trip" | "Assigned" | "Available" | "Rest Day" | "On Leave";
export function driverStatus(driver: Driver, trips: Trip[], date = TODAY): DriverStatus {
  const active = trips.find((t) => t.driverId === driver.id && ACTIVE_TRIP_STATUSES.includes(t.status));
  if (active) return "On Trip";
  const off = driverUnavailability(driver.id, date);
  if (off) return /rest/i.test(off.reason) ? "Rest Day" : "On Leave";
  if (trips.some((t) => t.driverId === driver.id && t.date === date && t.status === "Planned")) return "Assigned";
  return "Available";
}

/** Latest known odometer: max of the truck's recorded reading, trip readings and fuel logs. */
export function currentOdometer(truck: Truck, trips: Trip[], fuelLogs: FuelLog[]) {
  let odo = truck.mileageKm;
  for (const t of trips) if (t.truckId === truck.id) odo = Math.max(odo, t.odometerEnd ?? t.odometerStart ?? 0);
  for (const f of fuelLogs) if (f.truckId === truck.id) odo = Math.max(odo, f.odometerKm);
  return odo;
}

export interface MaintenanceOutlook {
  nextPms?: { dueKm: number; kmLeft: number; dueDate?: string; daysLeft?: number; source: MaintenanceRecord };
  overdue: MaintenanceRecord[];
  upcoming: MaintenanceRecord[];
  lastService?: MaintenanceRecord;
  inShop?: MaintenanceRecord;
}

export function maintenanceOutlook(truckId: string, records: MaintenanceRecord[], odometer: number, today = TODAY): MaintenanceOutlook {
  const mine = records.filter((r) => r.truckId === truckId);
  const done = mine.filter((r) => r.status === "Completed").sort((a, b) => b.date.localeCompare(a.date));
  const pms = done.find((r) => r.nextServiceKm && (r.type === "Preventive Maintenance" || r.type === "Oil Change"));
  const scheduled = mine.filter((r) => r.status === "Scheduled").sort((a, b) => a.date.localeCompare(b.date));
  return {
    nextPms: pms
      ? {
          dueKm: pms.nextServiceKm!,
          kmLeft: pms.nextServiceKm! - odometer,
          dueDate: pms.nextServiceDate,
          daysLeft: pms.nextServiceDate ? differenceInCalendarDays(parseISO(pms.nextServiceDate), parseISO(today)) : undefined,
          source: pms,
        }
      : undefined,
    overdue: scheduled.filter((r) => r.date < today),
    upcoming: scheduled.filter((r) => r.date >= today),
    lastService: done[0],
    inShop: mine.find((r) => r.status === "In Progress"),
  };
}

export type DocumentStatus = "Valid" | "Expiring Soon" | "Expired";
export function documentStatus(doc: Pick<VehicleDocument, "expiryDate">, today = TODAY): { status: DocumentStatus; daysLeft: number } {
  const daysLeft = differenceInCalendarDays(parseISO(doc.expiryDate), parseISO(today));
  return { status: daysLeft < 0 ? "Expired" : daysLeft <= 30 ? "Expiring Soon" : "Valid", daysLeft };
}

/**
 * Full-to-full fuel efficiency: km driven between two full-tank fill-ups divided by the
 * litres added since the previous full tank. Logs without a prior full tank have no figure.
 */
export function fuelEfficiencyByLog(logs: FuelLog[]) {
  const out = new Map<string, number>();
  const byTruck = new Map<string, FuelLog[]>();
  for (const f of logs) (byTruck.get(f.truckId) ?? byTruck.set(f.truckId, []).get(f.truckId)!).push(f);
  for (const list of byTruck.values()) {
    const sorted = [...list].sort((a, b) => a.odometerKm - b.odometerKm || a.date.localeCompare(b.date));
    let lastFull: FuelLog | undefined;
    let litres = 0;
    for (const f of sorted) {
      litres += f.liters;
      if (!f.fullTank) continue;
      if (lastFull && f.odometerKm > lastFull.odometerKm) out.set(f.id, (f.odometerKm - lastFull.odometerKm) / litres);
      lastFull = f;
      litres = 0;
    }
  }
  return out;
}

// ─── Billing ────────────────────────────────────────────────────────────────
export const invoiceIdForJob = (jobId: string) => jobId.replace("JOB-", "INV-");
export const deliveryIdForJob = (jobId: string) => jobId.replace("JOB-", "DLV-");

function addDaysISO(iso: string, n: number) {
  return format(addMinutes(parseISO(iso), n * 24 * 60), "yyyy-MM-dd");
}

export const getInvoices = memoizeLast((jobs: LogisticsJob[], payments: Payment[], today: string = TODAY): Invoice[] => {
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.invoiceId, (paid.get(p.invoiceId) ?? 0) + p.amount);
  const out: Invoice[] = [];
  for (const j of jobs) {
    if (!isBillableJob(j)) continue;
    const id = invoiceIdForJob(j.id);
    const total = jobTotal(j);
    const p = Math.min(total, paid.get(id) ?? 0);
    const issueDate = (j.deliveredAt ?? j.requiredBy).slice(0, 10);
    const dueDate = addDaysISO(issueDate, termsDays(j.paymentTerms));
    const balance = Math.max(0, total - p);
    const daysOverdue = balance > 0 ? Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(dueDate))) : 0;
    out.push({ id, jobId: j.id, customerId: j.customerId, tripId: j.tripId, issueDate, dueDate, total, paid: p, balance, daysOverdue, status: balance <= 0 ? "Paid" : daysOverdue > 0 ? "Overdue" : p > 0 ? "Partial" : "Current" });
  }
  return out;
});
export const getInvoiceMap = memoizeLast((invoices: Invoice[]) => new Map(invoices.map((i) => [i.jobId, i])));

export function jobPaymentStatus(j: LogisticsJob, invoice: Invoice | undefined): PaymentStatus {
  if (invoice) {
    if (invoice.balance <= 0) return "Paid";
    if (invoice.paid > 0) return "Partial";
    if (isCreditTerms(j.paymentTerms) && invoice.daysOverdue === 0) return "Credit";
    return "Unpaid";
  }
  return isCreditTerms(j.paymentTerms) ? "Credit" : "Unpaid";
}

// ─── Customers ──────────────────────────────────────────────────────────────
export interface CustomerStats {
  jobs: number;
  windowRevenue: number;
  lifetimeRevenue: number;
  avgJob: number;
  lastJob?: string;
  kgShipped: number;
  outstanding: number;
  overdue: number;
  oldestOverdueDays: number;
  jobsPerWeek: number;
  aging: Record<AgingBucket, number>;
}
const emptyAging = (): Record<AgingBucket, number> => ({ current: 0, d1_7: 0, d8_30: 0, d31_60: 0, d60p: 0 });

export const getCustomerStats = memoizeLast((customers: Customer[], jobs: LogisticsJob[], invoices: Invoice[], baseline: Record<string, number>) => {
  const map = new Map<string, CustomerStats>();
  for (const c of customers) map.set(c.id, { jobs: 0, windowRevenue: 0, lifetimeRevenue: baseline[c.id] ?? 0, avgJob: 0, kgShipped: 0, outstanding: 0, overdue: 0, oldestOverdueDays: 0, jobsPerWeek: 0, aging: emptyAging() });
  const billed = new Map<string, number>();
  for (const j of jobs) {
    const s = map.get(j.customerId);
    if (!s || j.status === "Cancelled" || j.status === "Inquiry" || j.status === "Quoted" || j.notes?.startsWith("Opening balance")) continue;
    s.jobs += 1;
    const d = j.pickupAt.slice(0, 10);
    if (!s.lastJob || d > s.lastJob) s.lastJob = d;
    if (isBillableJob(j)) {
      s.windowRevenue += jobTotal(j);
      s.lifetimeRevenue += jobTotal(j);
      s.kgShipped += j.weightKg;
      billed.set(j.customerId, (billed.get(j.customerId) ?? 0) + 1);
    }
  }
  for (const inv of invoices) {
    const s = map.get(inv.customerId);
    if (!s || inv.balance <= 0) continue;
    s.outstanding += inv.balance;
    s.aging[agingBucket(inv.daysOverdue)] += inv.balance;
    if (inv.daysOverdue > 0) {
      s.overdue += inv.balance;
      s.oldestOverdueDays = Math.max(s.oldestOverdueDays, inv.daysOverdue);
    }
  }
  for (const [id, s] of map) {
    s.avgJob = s.windowRevenue / Math.max(1, billed.get(id) ?? 0);
    s.jobsPerWeek = s.jobs / (30 / 7);
  }
  return map;
});

export function frequencyLabel(perWeek: number) {
  if (perWeek >= 4.5) return "Daily";
  if (perWeek >= 2.5) return `${Math.round(perWeek)}× a week`;
  if (perWeek >= 1.5) return "2× a week";
  if (perWeek >= 0.75) return "Weekly";
  if (perWeek > 0.2) return "Every 2–3 weeks";
  if (perWeek > 0) return "Monthly";
  return "No bookings yet";
}

// ─── Dispatch ───────────────────────────────────────────────────────────────
/** Confirmed jobs with no trip yet, for a pickup date. */
export function unassignedJobs(jobs: LogisticsJob[], date?: string) {
  return jobs.filter((j) => isOpenJob(j) && !j.tripId && (!date || j.pickupAt.slice(0, 10) === date));
}


export const minutesLate = (planned: string, actual: string) => differenceInMinutes(parseISO(actual), parseISO(planned));

// ─── Re-planning after cargo changes ────────────────────────────────────────
const deliveryStatusForTrip = (status: TripStatus): DeliveryStatus => (status === "Loading" ? "Loading" : status === "Ready" ? "Ready" : "Scheduled");

/**
 * Re-plan a trip's stops from its loads and keep its delivery records in step:
 * one delivery per job dropped by the trip, ETAs from the drop stop.
 */
export function rebuildTrip(trip: Trip, loads: Load[], jobs: LogisticsJob[], customers: Customer[], deliveries: Delivery[]): { trip: Trip; deliveries: Delivery[] } {
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const custMap = new Map(customers.map((c) => [c.id, c]));
  const tl = loads.filter((l) => l.tripId === trip.id && l.status !== "Cancelled");
  const stops = planStops(trip, tl, { job: (id) => jobMap.get(id), customer: (id) => custMap.get(id) }, trip.stops);
  const next: Trip = { ...trip, stops };
  const jobIds = new Set(tl.map((l) => l.jobId).filter((x): x is string => !!x));
  const out: Delivery[] = [];
  for (const d of deliveries) {
    if (d.tripId !== trip.id) {
      out.push(d);
      continue;
    }
    if (DELIVERY_DONE.includes(d.status)) {
      out.push(d);
      continue;
    }
    if (!jobIds.has(d.jobId)) continue;
    const ids = tl.filter((l) => l.jobId === d.jobId).map((l) => l.id);
    out.push({ ...d, loadIds: ids, eta: dropStopFor(next, ids)?.plannedArrival ?? d.eta });
  }
  for (const jid of jobIds) {
    if (out.some((d) => d.jobId === jid && d.tripId === trip.id)) continue;
    const job = jobMap.get(jid);
    const ids = tl.filter((l) => l.jobId === jid).map((l) => l.id);
    const stop = dropStopFor(next, ids);
    if (!job || !stop || stop.type === "Warehouse") continue;
    out.push({ id: deliveryIdForJob(jid), jobId: jid, tripId: trip.id, customerId: job.customerId, loadIds: ids, status: deliveryStatusForTrip(trip.status), eta: stop.plannedArrival, issues: [] });
  }
  return { trip: next, deliveries: out };
}

/** Next sequence number for readable IDs like JOB-260925-014. */
export function nextSeqId(prefix: string, dateKey: string, existing: { id: string }[], width = 3) {
  const head = `${prefix}-${dateKey}-`;
  const n = existing.filter((x) => x.id.startsWith(head)).reduce((m, x) => Math.max(m, Number(x.id.slice(head.length)) || 0), 0) + 1;
  return `${head}${String(n).padStart(width, "0")}`;
}
