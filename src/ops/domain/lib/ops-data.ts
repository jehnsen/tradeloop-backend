// GENERATED from trade-route-frontend/lib/ops-data.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
/**
 * The organization's operational data set and the change sets that move it between versions.
 * The API diffs its state after every command (`diffOpsData`) and the app applies the same
 * change set to its copy (`applyOpsChanges`), so both sides keep identical records and order.
 */
import type { CollectionChange, OpsChanges, OpsCollection, OpsData } from "../types";

export const OPS_COLLECTIONS = [
  "customers",
  "leads",
  "quotes",
  "jobs",
  "loads",
  "trips",
  "deliveries",
  "payments",
  "expenses",
  "fuelLogs",
  "maintenance",
  "documents",
  "notifications",
  "truckingPartners",
  "boardLoads",
  "boardCapacity",
  "backhaulListings",
  "backhaulRequests",
  "orders",
  "purchaseOrders",
  "salesPayments",
  "inventory",
  "standingOrders",
  "quoteRequests",
] as const satisfies readonly OpsCollection[];

// Compile-time guard: every OpsData key is listed above.
type Unlisted = Exclude<OpsCollection, (typeof OPS_COLLECTIONS)[number]>;
const allListed: [Unlisted] extends [never] ? true : never = true;
void allListed;

export function emptyOpsData(): OpsData {
  return Object.fromEntries(OPS_COLLECTIONS.map((c) => [c, []])) as unknown as OpsData;
}

type Row = { id: string };

function diffCollection<T extends Row>(before: T[], after: T[]): CollectionChange<T> | undefined {
  const prev = new Map(before.map((r) => [r.id, r]));
  const next = new Set(after.map((r) => r.id));
  const upsert = after.filter((r) => prev.get(r.id) !== r);
  const remove = before.filter((r) => !next.has(r.id)).map((r) => r.id);
  const added = after.some((r) => !prev.has(r.id));
  const kept = before.filter((r) => next.has(r.id)).map((r) => r.id);
  const moved = !added && after.some((r, i) => r.id !== kept[i]);
  if (!upsert.length && !remove.length && !moved) return undefined;
  return { upsert, remove, ...(added || moved ? { order: after.map((r) => r.id) } : {}) };
}

/** What changed between two versions. Records are immutable, so a changed record is a new object. */
export function diffOpsData(before: OpsData, after: OpsData): OpsChanges {
  const changes: Record<string, CollectionChange<Row>> = {};
  for (const c of OPS_COLLECTIONS) {
    if (before[c] === after[c]) continue;
    const change = diffCollection<Row>(before[c], after[c]);
    if (change) changes[c] = change;
  }
  return changes as OpsChanges;
}

function applyCollection<T extends Row>(rows: T[], change: CollectionChange<T>): T[] {
  const upserted = new Map(change.upsert.map((r) => [r.id, r]));
  if (change.order) {
    const current = new Map(rows.map((r) => [r.id, r]));
    return change.order.map((id) => upserted.get(id) ?? current.get(id)).filter((r): r is T => !!r);
  }
  const removed = new Set(change.remove);
  return rows.filter((r) => !removed.has(r.id)).map((r) => upserted.get(r.id) ?? r);
}

/** Apply a change set, keeping each collection in the server's order. Unchanged collections keep their identity. */
export function applyOpsChanges(data: OpsData, changes: OpsChanges): OpsData {
  const next: Record<string, Row[]> = { ...data };
  for (const c of OPS_COLLECTIONS) {
    const change = changes[c] as CollectionChange<Row> | undefined;
    if (change) next[c] = applyCollection<Row>(data[c], change);
  }
  return next as unknown as OpsData;
}
