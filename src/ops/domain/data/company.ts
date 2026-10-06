// GENERATED from trade-route-frontend/data/company.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import { addDays, format, parseISO } from "date-fns";
import type { CompanyProfile, Helper, StaffMember } from "../types";

// The operations clock. All "today" logic reads these, never `new Date()`. They start at the demo
// anchor (the seed's "now") and follow the API's clock through `setClock`.
export let NOW = "2026-09-25T07:48";
export let TODAY = "2026-09-25";
export let TOMORROW = "2026-09-26";

/** Move the clock to the API's operations time ("YYYY-MM-DDTHH:mm"). */
export function setClock(now: string) {
  NOW = now.slice(0, 16);
  TODAY = NOW.slice(0, 10);
  TOMORROW = format(addDays(parseISO(TODAY), 1), "yyyy-MM-dd");
}

export const PLATFORM = {
  name: "TradeLoop",
  tagline: "Wholesale Trading & Logistics, Connected.",
};

// Tenant registries: filled from the signed-in organization's profile by `applyTenantProfile`
// (data/tenant.ts) before any screen renders, then read synchronously by the domain helpers.

export const COMPANY: CompanyProfile = {
  name: "",
  shortName: "",
  address: "",
  warehouse: "",
  phone: "",
  mobile: "",
  messenger: "",
  email: "",
  tin: "",
  businessHours: "",
  bankAccountMasked: "",
  gcashMasked: "",
};

export const STAFF: StaffMember[] = [];
export const HELPERS: Helper[] = [];

export const staffById = (id: string) => STAFF.find((s) => s.id === id);
export const helperById = (id: string) => HELPERS.find((h) => h.id === id);
