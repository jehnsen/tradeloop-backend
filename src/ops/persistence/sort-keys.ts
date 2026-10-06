/**
 * Each collection is an ordered list (the screens rely on it, e.g. newest jobs first). Rows keep
 * that order through a `sort_key`: new records get a key between their neighbours, so a change
 * rewrites only the records it touched. When the existing order itself changed, or the gap
 * between neighbours is used up, the whole collection is renumbered.
 */
export const SORT_STEP = 1024;
const MIN_GAP = 1e-6;

export function renumber(order: string[]): Map<string, number> {
  return new Map(order.map((id, i) => [id, (i + 1) * SORT_STEP]));
}

/** Keys for records that are new or must move so that `order` sorts correctly. */
export function assignSortKeys(order: string[], keys: Map<string, number>): Map<string, number> {
  let previous = -Infinity;
  for (const id of order) {
    const k = keys.get(id);
    if (k === undefined) continue;
    if (k <= previous) return changedOnly(renumber(order), keys);
    previous = k;
  }
  const changed = new Map<string, number>();
  for (let i = 0; i < order.length;) {
    if (keys.has(order[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < order.length && !keys.has(order[j])) j++;
    const lo = i > 0 ? keys.get(order[i - 1]) : undefined;
    const hi = j < order.length ? keys.get(order[j]) : undefined;
    const n = j - i;
    if (lo !== undefined && hi !== undefined && (hi - lo) / (n + 1) < MIN_GAP)
      return changedOnly(renumber(order), keys);
    for (let t = 0; t < n; t++) {
      const key =
        lo === undefined && hi === undefined
          ? (t + 1) * SORT_STEP
          : lo === undefined
            ? hi! - (n - t) * SORT_STEP
            : hi === undefined
              ? lo + (t + 1) * SORT_STEP
              : lo + ((hi - lo) * (t + 1)) / (n + 1);
      changed.set(order[i + t], key);
    }
    i = j;
  }
  return changed;
}

function changedOnly(next: Map<string, number>, keys: Map<string, number>) {
  return new Map([...next].filter(([id, k]) => keys.get(id) !== k));
}
