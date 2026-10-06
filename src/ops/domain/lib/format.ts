// GENERATED from trade-route-frontend/lib/format.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import { addHours, differenceInCalendarDays, differenceInMinutes, format, parseISO, startOfHour } from "date-fns";
import { NOW, TODAY } from "../data/company";

const pesoFmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const pesoFmt2 = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const numFmt1 = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 });

export const peso = (n: number, decimals = false) => (decimals ? pesoFmt2 : pesoFmt).format(n);
export function pesoCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₱${numFmt1.format(n / 1_000_000)}M`;
  if (abs >= 10_000) return `₱${numFmt1.format(n / 1_000)}K`;
  return peso(n);
}
export const num = (n: number) => numFmt.format(n);
export const kg = (n: number) => `${numFmt.format(Math.round(n))} kg`;
export const qty = (n: number, unit: string) => `${numFmt.format(n)} ${unit === "pc" ? "pcs" : unit}`;
/** Handling units: "1 sack", "24 styro boxes", "3 bundles" (kg and pc keep their short forms). */
export function unitQty(n: number, unit: string) {
  if (unit === "kg" || unit === "pc") return qty(n, unit);
  const plural = n === 1 ? unit : /(x|s|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
  return `${numFmt.format(n)} ${plural}`;
}
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const fmtDate = (iso: string) => format(parseISO(iso), "MMM d, yyyy");
export const fmtDateShort = (iso: string) => format(parseISO(iso), "MMM d");
export const fmtDay = (iso: string) => format(parseISO(iso), "EEE, MMM d");
export const fmtTime = (iso: string) => format(parseISO(iso), "h:mm a");
export const fmtDateTime = (iso: string) => format(parseISO(iso), "MMM d, h:mm a");

/** "1–3 PM" / "11 AM–1 PM": a window starting on the hour, for times shared outside the company. */
export function fmtTimeWindow(iso: string, hours = 2) {
  const start = startOfHour(parseISO(iso));
  const end = addHours(start, hours);
  return format(start, "a") === format(end, "a") ? `${format(start, "h")}–${format(end, "h a")}` : `${format(start, "h a")}–${format(end, "h a")}`;
}

/** Human label relative to the demo clock (Sep 25, 2026 07:48). */
export function fmtRelative(iso: string) {
  const mins = differenceInMinutes(parseISO(NOW), parseISO(iso));
  if (mins >= 0 && mins < 1) return "just now";
  if (mins >= 0 && mins < 60) return `${mins} min ago`;
  if (mins >= 0 && mins < 60 * 12) return `${Math.floor(mins / 60)}h ago`;
  return relativeDay(iso.slice(0, 10)) + (iso.length > 10 ? `, ${fmtTime(iso)}` : "");
}

export function relativeDay(isoDate: string) {
  const d = differenceInCalendarDays(parseISO(isoDate), parseISO(TODAY));
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return format(parseISO(isoDate), "EEEE");
  return fmtDateShort(isoDate);
}

export const daysAgo = (isoDate: string) => differenceInCalendarDays(parseISO(TODAY), parseISO(isoDate.slice(0, 10)));
