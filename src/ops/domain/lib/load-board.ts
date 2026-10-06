// GENERATED from trade-route-frontend/lib/load-board.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
/**
 * Load board logic: derived statuses, capacity for our own trips, rule-based matching and
 * the share messages copied back into the GCs. Pure functions — records in, values out.
 *
 * Matching is a fixed set of explainable rules (route, direction, capacity, timing, truck
 * type, cargo restrictions). It is not route optimization and not machine learning.
 */
import { addMinutes, differenceInMinutes, format, parseISO } from "date-fns";
import type {
  AreaId,
  AvailableCapacity,
  AvailableLoad,
  AvailableLoadStatus,
  BoardContact,
  CapacityStatus,
  CargoCategory,
  CustomerType,
  InternalCapacity,
  LeadSource,
  Leg,
  LoadBoardSource,
  LogisticsJob,
  Place,
  Region,
  RequiredTruckType,
  Trip,
  TruckRequirement,
  TruckType,
  TruckingPartner,
} from "../types";
import { COMPANY, NOW, STAFF } from "../data/company";
import { areaById, areaName, LUCENA_WAREHOUSE, routeById } from "../data/areas";
import { truckById } from "../data/fleet";
import { suggestFreight } from "../data/cargo";
import { canAddReturnCargo, isTripEditable, travelMinutes, truckLocation, type TripMetrics } from "./logistics";
import { fmtDay, fmtTime, kg, peso, relativeDay } from "./format";
import { memoizeLast } from "./collections";

const fmt = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const plus = (dt: string, minutes: number) => fmt(addMinutes(parseISO(dt), minutes));
/** Hours from `a` to `b` (positive when b is later). */
const hoursBetween = (a: string, b: string) => differenceInMinutes(parseISO(b), parseISO(a)) / 60;

// ─── Reference lists ────────────────────────────────────────────────────────
export const LOAD_BOARD_SOURCES: LoadBoardSource[] = ["Messenger GC", "Viber GC", "Facebook Group", "Facebook Post", "Direct Contact", "Existing Customer", "Internal"];
export const TRUCK_TYPES: TruckType[] = ["10-Wheeler Closed Van", "10-Wheeler Wing Van", "6-Wheeler Closed Van", "6-Wheeler Reefer Van", "4-Wheeler Closed Van"];
export const REQUIRED_TRUCK_TYPES: RequiredTruckType[] = ["Any Truck", "Any Closed Van", ...TRUCK_TYPES];
export const LOAD_STATUSES: AvailableLoadStatus[] = ["Looking for Truck", "Matching", "Reserved", "Booked", "Expired", "Cancelled"];
export const CAPACITY_STATUSES: CapacityStatus[] = ["Open", "Partially Filled", "Full", "Departed", "Expired", "Cancelled"];
export const OPEN_CAPACITY: CapacityStatus[] = ["Open", "Partially Filled"];

const isTruckType = (v: string): v is TruckType => (TRUCK_TYPES as string[]).includes(v);

/** Our dispatch desk — the contact shared when we repost our own or a customer's cargo. */
export function dispatchContact(): BoardContact {
  const dispatcher = STAFF.find((s) => s.role === "dispatcher");
  return dispatcher ? { name: dispatcher.name, phone: dispatcher.phone } : { name: COMPANY.shortName, phone: COMPANY.mobile };
}

/** City-level place for posts that only name the town, e.g. "Valenzuela". */
export const cityPlace = (areaId: AreaId): Place => ({ name: areaName(areaId), areaId });
export const shortArea = (id: AreaId) => (id === "quezon-city" ? "QC" : areaName(id).replace(" City", ""));
/** "Valenzuela Produce Depot — Bodega 7 (Valenzuela)" or just "Valenzuela City". */
export const placeLabel = (p: Place) => (p.name.includes(shortArea(p.areaId)) ? p.name : `${p.name} (${shortArea(p.areaId)})`);

// ─── Available loads ────────────────────────────────────────────────────────
/** Hours past the requested pickup before an unbooked load counts as expired. */
const LOAD_GRACE_HOURS = 2;

/** Effective status: once a job exists it follows the job; unbooked loads expire after pickup time. */
export function loadStatus(load: AvailableLoad, job: LogisticsJob | undefined, now = NOW): AvailableLoadStatus {
  if (job) return job.status === "Cancelled" ? "Cancelled" : job.tripId ? "Booked" : "Reserved";
  if ((load.status === "Looking for Truck" || load.status === "Matching") && hoursBetween(load.pickupAt, now) > LOAD_GRACE_HOURS) return "Expired";
  return load.status;
}

/** Loads that still need a truck — including ones already turned into a job but not yet on a trip. */
export const needsTruck = (load: AvailableLoad, status: AvailableLoadStatus) => status === "Looking for Truck" || status === "Matching" || (status === "Reserved" && !!load.jobId);

// ─── Truck capacity ─────────────────────────────────────────────────────────
export interface CapacityView {
  post: AvailableCapacity;
  internal: boolean;
  trip?: Trip;
  partner?: TruckingPartner;
  /** "Truck 01" or the partner's company name. */
  truckLabel: string;
  truckType: TruckType;
  origin: Place;
  destination: Place;
  /** Areas passed on this leg, in order, from where the space opens up to the end of the leg. */
  routeAreas: AreaId[];
  /** Planned time the truck is in each route area. */
  areaEta: Partial<Record<AreaId, string>>;
  currentLocation: string;
  departureAt: string;
  arrivalAt: string;
  totalKg: number;
  usedKg: number;
  availableKg: number;
  status: CapacityStatus;
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];
export const isQuezon = (id: AreaId) => areaById(id).region === "Quezon Province";

/** One leg of one of our trips: where it starts and ends, the areas it passes and when. */
export function tripLeg(trip: Trip, leg: Leg) {
  const route = routeById(trip.routeId);
  const outDrops = trip.stops.filter((s) => (s.type === "Delivery" || s.type === "Port") && !isQuezon(s.location.areaId));
  const lastOut = outDrops[outDrops.length - 1];
  const lastOutArea = lastOut?.location.areaId ?? route.outboundAreas[route.outboundAreas.length - 1];
  const areaEta: Partial<Record<AreaId, string>> = {};
  const note = (area: AreaId, at: string) => (areaEta[area] ??= at);
  if (leg === "outbound") {
    const departureAt = trip.actualDeparture ?? trip.departure;
    note("lucena", departureAt);
    for (const s of outDrops) note(s.location.areaId, s.actualArrival ?? s.plannedArrival);
    const routeAreas = unique<AreaId>(["lucena", ...(outDrops.length ? outDrops.map((s) => s.location.areaId) : route.outboundAreas)]);
    return {
      origin: LUCENA_WAREHOUSE,
      destination: lastOut ? { ...lastOut.location } : cityPlace(lastOutArea),
      routeAreas,
      areaEta,
      departureAt,
      arrivalAt: lastOut?.plannedArrival ?? plus(departureAt, travelMinutes("lucena", lastOutArea)),
    };
  }
  const departureAt = lastOut ? (lastOut.actualDeparture ?? lastOut.plannedDeparture) : trip.departure;
  note(lastOutArea, departureAt);
  const after = lastOut ? trip.stops.slice(trip.stops.indexOf(lastOut) + 1) : trip.stops;
  for (const s of after) note(s.location.areaId, s.actualArrival ?? s.plannedArrival);
  const end = trip.stops[trip.stops.length - 1];
  return {
    origin: cityPlace(lastOutArea),
    destination: LUCENA_WAREHOUSE,
    routeAreas: unique<AreaId>([lastOutArea, ...route.returnAreas, ...after.map((s) => s.location.areaId), "lucena"]),
    areaEta,
    departureAt,
    arrivalAt: end?.type === "Warehouse" ? end.plannedArrival : trip.expectedReturn,
  };
}

/** Whether our trip can still take cargo on this leg. */
export const legOpen = (trip: Trip, leg: Leg) => trip.status !== "Cancelled" && (leg === "return" ? canAddReturnCargo(trip) : isTripEditable(trip));

function derivedCapacityStatus(recorded: CapacityStatus, departed: boolean, cancelled: boolean, usedKg: number, availableKg: number): CapacityStatus {
  if (recorded === "Cancelled" || recorded === "Expired") return recorded;
  if (cancelled) return "Cancelled";
  if (departed) return "Departed";
  if (recorded === "Full" || availableKg <= 0) return "Full";
  return usedKg > 0 ? "Partially Filled" : "Open";
}

/**
 * Resolve every capacity post. Our own trucks read capacity from the trip's loads
 * (Available = configured payload − assigned payload on that leg), so the board, the trip
 * and Backhaul always agree. Partner trucks use the figures they posted.
 */
export const getCapacityViews = memoizeLast((posts: AvailableCapacity[], trips: Trip[], metrics: Map<string, TripMetrics>, partners: TruckingPartner[], now: string = NOW) => {
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const partnerMap = new Map(partners.map((p) => [p.id, p]));
  const out = new Map<string, CapacityView>();
  for (const post of posts) {
    if (post.fleet === "internal") {
      const trip = tripMap.get(post.tripId);
      const m = metrics.get(post.tripId);
      if (!trip || !m) continue;
      const truck = truckById(trip.truckId);
      const leg = tripLeg(trip, post.leg);
      const usedKg = post.leg === "return" ? m.returnKg : m.outboundKg;
      const availableKg = Math.max(0, m.capacityKg - usedKg);
      out.set(post.id, {
        post,
        internal: true,
        trip,
        truckLabel: truck.code,
        truckType: isTruckType(truck.vehicleType) ? truck.vehicleType : "10-Wheeler Closed Van",
        ...leg,
        currentLocation: truckLocation(trip).label,
        totalKg: m.capacityKg,
        usedKg,
        availableKg,
        status: derivedCapacityStatus(post.status, !legOpen(trip, post.leg), trip.status === "Cancelled", usedKg, availableKg),
      });
    } else {
      const partner = post.partnerId ? partnerMap.get(post.partnerId) : undefined;
      const routeAreas = unique<AreaId>([post.currentLocation.areaId, ...post.plannedRoute, post.destination.areaId]);
      const areaEta: Partial<Record<AreaId, string>> = {};
      for (const a of routeAreas) areaEta[a] = a === post.currentLocation.areaId ? post.departureAt : plus(post.departureAt, travelMinutes(post.currentLocation.areaId, a));
      const availableKg = Math.max(0, post.totalCapacityKg - post.usedCapacityKg);
      out.set(post.id, {
        post,
        internal: false,
        partner,
        truckLabel: partner?.name ?? post.contact.name,
        truckType: post.truckType,
        origin: post.currentLocation,
        destination: post.destination,
        routeAreas,
        areaEta,
        currentLocation: post.currentLocation.name,
        departureAt: post.departureAt,
        arrivalAt: areaEta[post.destination.areaId] ?? post.departureAt,
        totalKg: post.totalCapacityKg,
        usedKg: post.usedCapacityKg,
        availableKg,
        status: derivedCapacityStatus(post.status, hoursBetween(post.departureAt, now) > 1, false, post.usedCapacityKg, availableKg),
      });
    }
  }
  return out;
});

export const routeLine = (v: Pick<CapacityView, "routeAreas">) => v.routeAreas.map(shortArea).join(" → ");

/** Our trips (today & tomorrow) with at least 1,000 kg of return space nobody has posted yet. */
export function unpostedReturnCapacity(trips: Trip[], metrics: Map<string, TripMetrics>, posts: AvailableCapacity[], dates: string[]) {
  const posted = new Set(posts.filter((p): p is InternalCapacity => p.fleet === "internal" && p.leg === "return" && p.status !== "Cancelled" && p.status !== "Expired").map((p) => p.tripId));
  return trips
    .filter((t) => dates.includes(t.date) && legOpen(t, "return") && !posted.has(t.id))
    .map((t) => ({ trip: t, availableKg: Math.max(0, metrics.get(t.id)!.capacityKg - metrics.get(t.id)!.returnKg) }))
    .filter((x) => x.availableKg >= 1000)
    .sort((a, b) => a.trip.departure.localeCompare(b.trip.departure));
}

// ─── Matching ───────────────────────────────────────────────────────────────
export type MatchLabel = "Strong Match" | "Possible Match" | "Poor Fit";
export type CheckResult = "ok" | "partial" | "fail";
export type MatchRule = "pickup" | "destination" | "capacity" | "timing" | "truck" | "cargo";
export interface MatchCheck {
  rule: MatchRule;
  result: CheckResult;
  text: string;
}
export interface BoardMatch {
  loadId: string;
  capacityId: string;
  label: MatchLabel;
  checks: MatchCheck[];
  /** Space left on the truck after this load. Negative when it does not fit. */
  availableAfter: number;
  score: number;
}

/** Towns on SLEX / Maharlika Highway between Metro Manila and Lucena. */
const SOUTH_CORRIDOR: AreaId[] = ["santa-rosa", "calamba", "candelaria", "sariaya"];
const NORTH_OF_QUEZON: Region[] = ["Metro Manila", "Cavite", "Laguna"];
/** The truck drives the SLEX / Maharlika corridor on this leg (Quezon ↔ Metro Manila / Cavite / Laguna). */
function usesCorridor(v: CapacityView) {
  const a = areaById(v.origin.areaId).region;
  const b = areaById(v.destination.areaId).region;
  return (a === "Quezon Province" && NORTH_OF_QUEZON.includes(b)) || (b === "Quezon Province" && NORTH_OF_QUEZON.includes(a));
}

/**
 * When the truck is in an area on this leg. Off-route areas are timed from the last route
 * area the truck passes before reaching them (e.g. Calamba after the QC pickup, heading home).
 */
export function etaAt(v: Pick<CapacityView, "origin" | "destination" | "routeAreas" | "areaEta" | "departureAt">, area: AreaId) {
  const known = v.areaEta[area];
  if (known) return known;
  const d = areaById(area).driveMinutes;
  const towardLucena = areaById(v.destination.areaId).driveMinutes < areaById(v.origin.areaId).driveMinutes;
  const before = v.routeAreas.filter((a) => (towardLucena ? areaById(a).driveMinutes > d : areaById(a).driveMinutes < d));
  const from = before[before.length - 1] ?? v.origin.areaId;
  return plus(v.areaEta[from] ?? v.departureAt, travelMinutes(from, area));
}

const when = (dt: string) => `${relativeDay(dt.slice(0, 10))} ${fmtTime(dt)}`;

function pickupCheck(load: AvailableLoad, v: CapacityView): MatchCheck {
  const area = load.pickup.areaId;
  const idx = v.routeAreas.indexOf(area);
  const last = v.routeAreas.length - 1;
  if (idx !== -1 && idx < last) return { rule: "pickup", result: "ok", text: `Pickup in ${shortArea(area)} is on the truck's route` };
  if (idx === last) return { rule: "pickup", result: "fail", text: `Truck's route ends in ${shortArea(area)} — it would have to turn around` };
  if (usesCorridor(v) && SOUTH_CORRIDOR.includes(area)) return { rule: "pickup", result: "partial", text: `${shortArea(area)} is along SLEX / Maharlika Hwy — short stop off the route` };
  const region = areaById(area).region;
  if (v.routeAreas.slice(0, last).some((a) => areaById(a).region === region)) return { rule: "pickup", result: "partial", text: `Pickup needs a detour within ${region}` };
  return { rule: "pickup", result: "fail", text: `Pickup in ${shortArea(area)} is off the route` };
}

function destinationCheck(load: AvailableLoad, v: CapacityView): MatchCheck {
  const area = load.destination.areaId;
  const pickupIdx = v.routeAreas.indexOf(load.pickup.areaId);
  const idx = v.routeAreas.indexOf(area);
  if (area === v.destination.areaId) return { rule: "destination", result: "ok", text: `Same destination (${shortArea(area)})` };
  if (idx !== -1 && idx > Math.max(pickupIdx, 0)) return { rule: "destination", result: "ok", text: `Drop-off in ${shortArea(area)} is on the way` };
  if (idx !== -1 && pickupIdx !== -1 && idx <= pickupIdx) return { rule: "destination", result: "fail", text: "Load goes the opposite direction" };
  if (usesCorridor(v) && SOUTH_CORRIDOR.includes(area)) return { rule: "destination", result: "ok", text: `${shortArea(area)} is along the highway to ${shortArea(v.destination.areaId)}` };
  if (areaById(area).region === areaById(v.destination.areaId).region) return { rule: "destination", result: "partial", text: `${shortArea(area)} is a short side trip from ${shortArea(v.destination.areaId)}` };
  return { rule: "destination", result: "fail", text: `Drop-off in ${shortArea(area)} is off the route` };
}

function capacityCheck(load: AvailableLoad, v: CapacityView): MatchCheck {
  const after = v.availableKg - load.weightKg;
  if (after >= 0) return { rule: "capacity", result: "ok", text: `Capacity sufficient — ${kg(v.availableKg)} free, ${kg(after)} left after` };
  return { rule: "capacity", result: "fail", text: `Needs ${kg(load.weightKg)}, only ${kg(v.availableKg)} free` };
}

function timingCheck(load: AvailableLoad, v: CapacityView): MatchCheck {
  const passAt = etaAt(v, load.pickup.areaId);
  if (load.deliveryBy) {
    const arrive = etaAt(v, load.destination.areaId);
    if (arrive > load.deliveryBy) return { rule: "timing", result: "fail", text: `Truck reaches ${shortArea(load.destination.areaId)} ~${when(arrive)}, after the required ${when(load.deliveryBy)}` };
  }
  const gap = Math.abs(hoursBetween(passAt, load.pickupAt));
  if (gap <= 3) return { rule: "timing", result: "ok", text: `Departure window compatible — truck in ${shortArea(load.pickup.areaId)} ~${fmtTime(passAt)}, pickup ${fmtTime(load.pickupAt)}` };
  if (gap <= 8) return { rule: "timing", result: "partial", text: `Needs coordination — truck in ${shortArea(load.pickup.areaId)} ~${when(passAt)}, pickup ${when(load.pickupAt)}` };
  return { rule: "timing", result: "fail", text: `Timing does not fit — truck ~${when(passAt)}, pickup ${when(load.pickupAt)}` };
}

const body = (t: TruckType) => t.replace(/^\d+-Wheeler /, "");
const wheels = (t: TruckType) => Number.parseInt(t, 10);

function truckCheck(load: AvailableLoad, v: CapacityView): MatchCheck {
  const need = load.truckType;
  const have = v.truckType;
  if (need === "Any Truck") return { rule: "truck", result: "ok", text: "Any truck type accepted" };
  if (need === "Any Closed Van") {
    if (body(have) === "Wing Van") return { rule: "truck", result: "partial", text: "Wing van offered — confirm with the shipper" };
    return { rule: "truck", result: "ok", text: `${have} meets "any closed van"` };
  }
  if (need === have) return { rule: "truck", result: "ok", text: `Truck type matches (${have})` };
  if (body(need) === "Reefer Van") return { rule: "truck", result: "fail", text: `Needs a reefer van — ${have} offered` };
  if (body(need) === body(have) && wheels(have) > wheels(need)) return { rule: "truck", result: "partial", text: `Bigger truck than requested (${have})` };
  return { rule: "truck", result: "fail", text: `Needs ${need} — ${have} offered` };
}

function cargoCheck(load: AvailableLoad, v: CapacityView): MatchCheck {
  const accepted = v.post.acceptedCargo;
  if (accepted.length === 0) return { rule: "cargo", result: "ok", text: "No cargo restrictions" };
  if (accepted.includes(load.cargoCategory)) return { rule: "cargo", result: "ok", text: `Accepts ${load.cargoCategory.toLowerCase()}` };
  return { rule: "cargo", result: "fail", text: `Takes ${accepted.join(", ").toLowerCase()} only` };
}

/** Explainable rule-based fit of one load on one truck's space. */
export function matchLoad(load: AvailableLoad, v: CapacityView): BoardMatch {
  const checks = [pickupCheck(load, v), destinationCheck(load, v), capacityCheck(load, v), timingCheck(load, v), truckCheck(load, v), cargoCheck(load, v)];
  const fails = checks.filter((c) => c.result === "fail").length;
  const partials = checks.filter((c) => c.result === "partial").length;
  const label: MatchLabel = fails ? "Poor Fit" : partials ? "Possible Match" : "Strong Match";
  const score = (label === "Strong Match" ? 100 : label === "Possible Match" ? 50 : 0) - partials * 5 - fails * 5 + (v.internal ? 2 : 0);
  return { loadId: load.id, capacityId: v.post.id, label, checks, availableAfter: v.availableKg - load.weightKg, score };
}

export const isGoodMatch = (m: BoardMatch) => m.label !== "Poor Fit";

/** All load × capacity pairs among open posts, best first, indexed both ways. */
export const getBoardMatches = memoizeLast((loads: AvailableLoad[], views: Map<string, CapacityView>, jobs: LogisticsJob[]) => {
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const openLoads = loads.filter((l) => needsTruck(l, loadStatus(l, l.jobId ? jobMap.get(l.jobId) : undefined)));
  const openCaps = [...views.values()].filter((v) => OPEN_CAPACITY.includes(v.status));
  const byLoad = new Map<string, BoardMatch[]>();
  const byCapacity = new Map<string, BoardMatch[]>();
  for (const l of openLoads) {
    for (const v of openCaps) {
      const m = matchLoad(l, v);
      (byLoad.get(l.id) ?? byLoad.set(l.id, []).get(l.id)!).push(m);
      (byCapacity.get(v.post.id) ?? byCapacity.set(v.post.id, []).get(v.post.id)!).push(m);
    }
  }
  const order = (a: BoardMatch, b: BoardMatch) => b.score - a.score || b.availableAfter - a.availableAfter;
  for (const list of byLoad.values()) list.sort(order);
  for (const list of byCapacity.values()) list.sort(order);
  return { byLoad, byCapacity };
});

// ─── Booking onto our trips ─────────────────────────────────────────────────
/** Leg the cargo travels on: the capacity's leg for our trucks, else from where it is picked up. */
export function bookingLeg(load: Pick<AvailableLoad, "pickup">, capacity?: AvailableCapacity): Leg {
  if (capacity?.fleet === "internal") return capacity.leg;
  return isQuezon(load.pickup.areaId) ? "outbound" : "return";
}

export function truckRequirementFor(load: Pick<AvailableLoad, "weightKg" | "cargoCategory" | "truckType">): TruckRequirement {
  if (load.weightKg >= 6000) return "Full truck — 10-wheeler";
  if (load.cargoCategory === "Seafood" || load.cargoCategory === "Shellfish" || load.truckType === "6-Wheeler Reefer Van") return "Insulated van, iced cargo";
  return "Shared van (LTL)";
}

/** Offered freight if the shipper named one, else the demo rate card. */
export function bookingFreight(load: AvailableLoad, leg: Leg) {
  return load.offeredFreight ?? suggestFreight(leg, leg === "outbound" ? load.destination.areaId : load.pickup.areaId, load.weightKg);
}

export const requiredByFor = (load: Pick<AvailableLoad, "pickupAt" | "deliveryBy">) => load.deliveryBy ?? plus(load.pickupAt, 12 * 60);

const LEAD_SOURCE: Record<LoadBoardSource, LeadSource> = {
  "Messenger GC": "Messenger",
  "Viber GC": "Referral",
  "Facebook Group": "Facebook Group",
  "Facebook Post": "Facebook Page",
  "Direct Contact": "Referral",
  "Existing Customer": "Existing Customer Referral",
  Internal: "Walk-in",
};
export const leadSourceFor = (s: LoadBoardSource) => LEAD_SOURCE[s];

export function customerTypeFor(category: CargoCategory): CustomerType {
  if (category === "Seafood" || category === "Shellfish") return "Seafood Dealer";
  if (category === "Produce") return "Agri Trader";
  return "General Merchandise";
}

// ─── Share messages (copied into Messenger / Viber / Facebook) ─────────────
function whenLabel(dt: string) {
  const day = relativeDay(dt.slice(0, 10));
  if (day === "Today") return `${Number(dt.slice(11, 13)) >= 18 ? "Tonight" : "Today"}, ${fmtTime(dt)}`;
  return `${day === "Tomorrow" ? "Tomorrow" : fmtDay(dt)}, ${fmtTime(dt)}`;
}

/** Contact to put in a repost: our desk for our own or a customer's cargo, else the original poster. */
export const shareContactFor = (load: Pick<AvailableLoad, "source" | "contact">) => (load.source === "Internal" || load.source === "Existing Customer" ? dispatchContact() : load.contact);

export function loadShareMessage(load: AvailableLoad) {
  const contact = shareContactFor(load);
  return [
    "LOAD AVAILABLE",
    "",
    `Pickup: ${placeLabel(load.pickup)}`,
    `Destination: ${placeLabel(load.destination)}`,
    `Cargo: ${load.cargoDescription}`,
    `Weight: ${kg(load.weightKg)}`,
    `Pickup: ${whenLabel(load.pickupAt)}`,
    load.deliveryBy ? `Deliver by: ${whenLabel(load.deliveryBy)}` : undefined,
    `Truck Needed: ${load.truckType}`,
    load.specialHandling ? `Handling: ${load.specialHandling}` : undefined,
    load.offeredFreight ? `Budget: ${peso(load.offeredFreight)}` : undefined,
    `Contact: ${contact.name} — ${contact.phone}`,
    "",
    `Ref: ${load.id}`,
  ]
    .filter((x): x is string => x !== undefined)
    .join("\n");
}

export function capacityShareMessage(v: CapacityView) {
  const accepted = v.post.acceptedCargo;
  return [
    "AVAILABLE TRUCK CAPACITY",
    "",
    `Route: ${routeLine(v)}`,
    `Truck: ${v.truckType}`,
    `Available Capacity: ${kg(v.availableKg)}`,
    `Departure: ${whenLabel(v.departureAt)}`,
    accepted.length ? `Accepts: ${accepted.join(", ")}` : undefined,
    v.post.restrictions ? `Note: ${v.post.restrictions}` : undefined,
    `Contact: ${v.post.contact.name} — ${v.post.contact.phone}`,
    "",
    `Ref: ${v.post.id}`,
  ]
    .filter((x): x is string => x !== undefined)
    .join("\n");
}
