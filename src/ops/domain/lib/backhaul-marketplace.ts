// GENERATED from trade-route-frontend/lib/backhaul-marketplace.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
/**
 * Backhaul Marketplace (preview): our return legs to Lucena published for outside traders and
 * shippers. Pure functions — records in, values out.
 *
 * Open space is always read from the trip (configured payload − return kg), so the listing,
 * the trip, Backhaul and the Load Board agree. Quotes are the listing's ₱/kg with a minimum
 * charge. Fit checks are a fixed set of explainable rules, like the Load Board's matching.
 */
import { differenceInMinutes, parseISO } from "date-fns";
import type { AreaId, BackhaulBookingRequest, BackhaulListing, BackhaulListingStatus, BackhaulRequestStatus, CargoCategory, LogisticsJob, ShipperListing, ShipperRequestView, Trip } from "../types";
import { TODAY, TOMORROW } from "../data/company";
import { truckById } from "../data/fleet";
import { BACKHAUL_MINIMUM_FREIGHT, BACKHAUL_RATE_PER_KG } from "../data/cargo";
import { jobTotal, type TripMetrics } from "./logistics";
import { etaAt, isQuezon, legOpen, shortArea, tripLeg, type MatchCheck, type MatchLabel } from "./load-board";
import { fmtTime, fmtTimeWindow, kg, relativeDay } from "./format";
import { memoizeLast, sumBy } from "./collections";

export const REQUEST_STATUSES: BackhaulRequestStatus[] = ["Requested", "Confirmed", "Declined", "Cancelled", "Expired"];

/** Our vans carry seafood on the outbound leg, so some cargo never rides them. */
export const OUR_VAN_RESTRICTIONS = "Insulated closed van that also carries seafood — no cement, chemicals, fertilizer or livestock.";

export const DEFAULT_LISTING_TERMS: Pick<BackhaulListing, "ratePerKg" | "minimumCharge" | "acceptedCargo" | "restrictions"> = {
  ratePerKg: BACKHAUL_RATE_PER_KG,
  minimumCharge: BACKHAUL_MINIMUM_FREIGHT,
  acceptedCargo: [],
  restrictions: OUR_VAN_RESTRICTIONS,
};

/** Instant quote: ₱/kg on gross weight, rounded to ₱50, never below the minimum charge. */
export function marketplaceQuote(terms: Pick<BackhaulListing, "ratePerKg" | "minimumCharge">, weightKg: number) {
  return Math.max(terms.minimumCharge, Math.round((weightKg * terms.ratePerKg) / 50) * 50);
}

// ─── Listings ───────────────────────────────────────────────────────────────
export interface ListingView {
  trip: Trip;
  /** Undefined when the leg has not been listed yet. */
  listing?: BackhaulListing;
  truckLabel: string;
  truckType: string;
  leg: ReturnType<typeof tripLeg>;
  /** Areas where the truck can still pick up on the way home, before it reaches Quezon. */
  pickupAreas: AreaId[];
  totalKg: number;
  usedKg: number;
  openKg: number;
  status: BackhaulListingStatus | "Not Listed";
  /** Takes new shipper requests. */
  accepting: boolean;
  /** Confirming a request can still put cargo on the trip. */
  bookable: boolean;
  requests: BackhaulBookingRequest[];
  pendingKg: number;
  /** Marketplace bookings riding this leg (confirmed and not cancelled). */
  booked: { request: BackhaulBookingRequest; job: LogisticsJob }[];
  bookedKg: number;
  bookedFreight: number;
}

export function listingStatus(listing: BackhaulListing, trip: Trip, openKg: number): BackhaulListingStatus {
  if (listing.status === "Closed" || trip.status === "Cancelled") return "Closed";
  if (!legOpen(trip, "return")) return "Departed";
  if (listing.status === "Paused") return "Paused";
  return openKg <= 0 ? "Full" : "Published";
}

/** Effective request status: confirmed requests follow their job; unanswered ones expire with the leg. */
export function requestStatus(r: BackhaulBookingRequest, job: LogisticsJob | undefined, legStatus: ListingView["status"] | undefined): BackhaulRequestStatus {
  if (r.jobId) return job?.status === "Cancelled" ? "Cancelled" : "Confirmed";
  if (r.status === "Requested" && (legStatus === "Departed" || legStatus === "Closed")) return "Expired";
  return r.status;
}

/** Today's and tomorrow's return legs plus every listed leg, keyed by trip id, earliest first. */
export const getListingViews = memoizeLast((trips: Trip[], listings: BackhaulListing[], requests: BackhaulBookingRequest[], metrics: Map<string, TripMetrics>, jobs: LogisticsJob[]) => {
  const listingByTrip = new Map(listings.map((l) => [l.tripId, l]));
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const out = new Map<string, ListingView>();
  const shown = trips.filter((t) => listingByTrip.has(t.id) || ((t.date === TODAY || t.date === TOMORROW) && t.status !== "Cancelled")).sort((a, b) => a.departure.localeCompare(b.departure));
  for (const trip of shown) {
    const m = metrics.get(trip.id);
    if (!m) continue;
    const truck = truckById(trip.truckId);
    const listing = listingByTrip.get(trip.id);
    const leg = tripLeg(trip, "return");
    const openKg = Math.max(0, m.capacityKg - m.returnKg);
    const status = listing ? listingStatus(listing, trip, openKg) : "Not Listed";
    const own = listing ? requests.filter((r) => r.listingId === listing.id) : [];
    const booked = own.flatMap((r) => {
      const job = r.jobId ? jobMap.get(r.jobId) : undefined;
      return job && job.status !== "Cancelled" ? [{ request: r, job }] : [];
    });
    out.set(trip.id, {
      trip,
      listing,
      truckLabel: truck.code,
      truckType: truck.vehicleType,
      leg,
      pickupAreas: leg.routeAreas.filter((a) => !isQuezon(a)),
      totalKg: m.capacityKg,
      usedKg: m.returnKg,
      openKg,
      status,
      accepting: status === "Published",
      bookable: status === "Published" || status === "Paused" || status === "Full",
      requests: own,
      pendingKg: sumBy(own.filter((r) => requestStatus(r, undefined, status) === "Requested"), (r) => r.weightKg),
      booked,
      bookedKg: sumBy(booked, (b) => b.job.weightKg),
      bookedFreight: sumBy(booked, (b) => jobTotal(b.job)),
    });
  }
  return out;
});

/** "Valenzuela → Caloocan → QC → Sariaya → Lucena" */
export const legRouteLine = (v: { leg: { routeAreas: AreaId[] } }) => v.leg.routeAreas.map(shortArea).join(" → ");

// ─── What shippers see ──────────────────────────────────────────────────────
/** Truck times leave the company only as the start of a two-hour window. */
const hourStart = (dt: string) => `${dt.slice(0, 13)}:00`;

/** A listed leg as outside shippers see it. The only listing data the public page ever receives. */
export function toShipperListing(v: ListingView & { listing: BackhaulListing }): ShipperListing {
  const truck = truckById(v.trip.truckId);
  return {
    listingId: v.listing.id,
    date: v.trip.date,
    vehicleType: truck.vehicleType,
    body: truck.body,
    truckLabel: "our truck",
    leg: {
      origin: v.leg.origin,
      destination: v.leg.destination,
      routeAreas: v.leg.routeAreas,
      areaEta: Object.fromEntries(v.pickupAreas.map((a) => [a, hourStart(etaAt(v.leg, a))])),
      departureAt: hourStart(v.leg.departureAt),
      arrivalAt: hourStart(v.leg.arrivalAt),
    },
    pickupAreas: v.pickupAreas,
    openKg: v.openKg,
    accepting: v.accepting,
    listing: { ratePerKg: v.listing.ratePerKg, minimumCharge: v.listing.minimumCharge, acceptedCargo: v.listing.acceptedCargo, restrictions: v.listing.restrictions },
  };
}

/** A shipper's own request: status, cargo, pickup window and booking reference. Nothing about the truck. */
export function shipperRequestView(r: BackhaulBookingRequest, job: LogisticsJob | undefined, leg: ListingView | undefined): ShipperRequestView {
  const status = requestStatus(r, job, leg?.status);
  return {
    id: r.id,
    status,
    declineReason: status === "Declined" ? r.declineReason : undefined,
    cargoDescription: r.cargoDescription,
    quantity: r.quantity,
    unit: r.unit,
    weightKg: r.weightKg,
    pickup: r.pickup,
    dropoff: r.dropoff,
    quotedFreight: r.quotedFreight,
    tripDate: leg?.trip.date,
    pickupWindowAt: leg ? hourStart(etaAt(leg.leg, r.pickup.areaId)) : undefined,
    bookingRef: status === "Confirmed" ? job?.id : undefined,
    bookingStatus: status === "Confirmed" ? job?.status : undefined,
  };
}

// ─── Fit checks ─────────────────────────────────────────────────────────────
/** What the fit checks read from a leg: a dispatcher's ListingView or a shipper's ShipperListing. */
export interface FitView {
  pickupAreas: AreaId[];
  truckLabel: string;
  openKg: number;
  leg: Pick<ListingView["leg"], "origin" | "destination" | "routeAreas" | "areaEta" | "departureAt">;
  listing?: Pick<BackhaulListing, "acceptedCargo">;
}

export type RequestDraft = Pick<BackhaulBookingRequest, "pickup" | "dropoff" | "weightKg" | "cargoCategory" | "readyAt">;

const when = (dt: string) => `${relativeDay(dt.slice(0, 10))} ${fmtTime(dt)}`;

/** When the truck passes an area. Shippers outside the company only see a two-hour window. */
const passTime = (dt: string, shipper: boolean) => (shipper ? fmtTimeWindow(dt) : `~${fmtTime(dt)}`);

function pickupCheck(r: RequestDraft, v: FitView): MatchCheck {
  const area = r.pickup.areaId;
  if (v.pickupAreas.includes(area)) return { rule: "pickup", result: "ok", text: `Pickup in ${shortArea(area)} is on the return route` };
  return { rule: "pickup", result: "fail", text: `${shortArea(area)} is not on this return route (${v.pickupAreas.map(shortArea).join(", ")})` };
}

function destinationCheck(r: RequestDraft, v: FitView): MatchCheck {
  const area = r.dropoff.areaId;
  if (!isQuezon(area)) return { rule: "destination", result: "fail", text: `Drop-off must be in Quezon — ${v.truckLabel} is heading home to Lucena` };
  if (v.leg.routeAreas.includes(area)) return { rule: "destination", result: "ok", text: `Drop-off in ${shortArea(area)} is on the way to Lucena` };
  return { rule: "destination", result: "ok", text: `${shortArea(area)} is a short side trip near Lucena` };
}

function capacityCheck(r: RequestDraft, v: FitView): MatchCheck {
  const after = v.openKg - r.weightKg;
  if (after >= 0) return { rule: "capacity", result: "ok", text: `Fits — ${kg(v.openKg)} open, ${kg(after)} left after` };
  return { rule: "capacity", result: "fail", text: `Needs ${kg(r.weightKg)}, only ${kg(v.openKg)} open` };
}

/** Cargo ready before the truck passes is fine; up to an hour late means the truck waits. */
function timingCheck(r: RequestDraft, v: FitView, shipper: boolean): MatchCheck {
  const area = r.pickup.areaId;
  const passAt = etaAt(v.leg, area);
  const late = differenceInMinutes(parseISO(r.readyAt), parseISO(passAt));
  const pass = passTime(passAt, shipper);
  if (late <= 0) return { rule: "timing", result: "ok", text: `Cargo ready ${fmtTime(r.readyAt)} — truck in ${shortArea(area)} ${pass}` };
  if (late <= 60) return { rule: "timing", result: "partial", text: `Truck in ${shortArea(area)} ${pass}, cargo ready ${fmtTime(r.readyAt)} — ${shipper ? "the truck may have to wait" : `truck would wait ${late} min`}` };
  return { rule: "timing", result: "fail", text: `Cargo ready ${when(r.readyAt)} — truck passes ${shortArea(area)} ${relativeDay(passAt.slice(0, 10))} ${pass}` };
}

function cargoCheck(category: CargoCategory, listing: FitView["listing"]): MatchCheck {
  const accepted = listing?.acceptedCargo ?? [];
  if (accepted.length === 0) return { rule: "cargo", result: "ok", text: "No cargo category restrictions" };
  if (accepted.includes(category)) return { rule: "cargo", result: "ok", text: `Accepts ${category.toLowerCase()}` };
  return { rule: "cargo", result: "fail", text: `This leg takes ${accepted.join(", ").toLowerCase()} only` };
}

/**
 * Rule-by-rule fit of a request (or a shipper's draft) on a listed leg. Space is only checked
 * for requests that are not on the trip yet. `shipper` phrases truck times as windows.
 */
export function checkRequest(r: RequestDraft, v: FitView, { onTrip = false, shipper = false } = {}): { checks: MatchCheck[]; label: MatchLabel } {
  const checks = [pickupCheck(r, v), destinationCheck(r, v), ...(onTrip ? [] : [capacityCheck(r, v), timingCheck(r, v, shipper)]), cargoCheck(r.cargoCategory, v.listing)];
  const label: MatchLabel = checks.some((c) => c.result === "fail") ? "Poor Fit" : checks.some((c) => c.result === "partial") ? "Possible Match" : "Strong Match";
  return { checks, label };
}

// ─── Shipper lookup ─────────────────────────────────────────────────────────
const digits = (phone: string) => phone.replace(/\D/g, "").replace(/^63/, "0");

/** Public status check: a shipper finds their request with its number and the mobile number they gave. */
export function findShipperRequest(requests: BackhaulBookingRequest[], id: string, phone: string) {
  const want = id.trim().toUpperCase();
  const mobile = digits(phone);
  return mobile.length >= 7 ? requests.find((r) => r.id === want && digits(r.shipper.phone) === mobile) : undefined;
}
