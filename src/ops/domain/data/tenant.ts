// GENERATED from trade-route-frontend/data/tenant.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import type { PublicTenantProfile, TenantProfile } from "../types";
import { COMPANY, HELPERS, STAFF } from "./company";
import { DRIVERS, TRUCKS } from "./fleet";
import { LIFETIME_BASELINE, SALES_LIFETIME_BASELINE } from "./finance";

const fill = <T,>(target: T[], items: T[]) => void target.splice(0, target.length, ...items);
const fillRecord = (target: Record<string, number>, source: Record<string, number>) => {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, source);
};

/**
 * Load an organization's reference data into the shared registries (company, staff, fleet,
 * baselines). The registries are read synchronously by the domain helpers, so this runs before
 * any screen renders. Public pages pass only the company and dispatch desk.
 */
export function applyTenantProfile(p: TenantProfile | PublicTenantProfile) {
  Object.assign(COMPANY, p.company);
  fill(STAFF, p.staff);
  if (!("trucks" in p)) return;
  fill(HELPERS, p.helpers);
  fill(TRUCKS, p.trucks);
  fill(DRIVERS, p.drivers);
  fillRecord(LIFETIME_BASELINE, p.lifetimeBaseline);
  fillRecord(SALES_LIFETIME_BASELINE, p.salesLifetimeBaseline);
}
