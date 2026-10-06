// GENERATED from trade-route-frontend/lib/collections.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
/**
 * Dependency-free collection helpers used by the domain libraries. Kept separate from
 * `lib/utils.ts` (which pulls in UI packages) so the domain code can run on the API server too.
 */

/** Cache the last result of a pure function keyed on argument identity (for zustand slices). */
export function memoizeLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | undefined;
  let lastResult: R;
  return (...args: A) => {
    if (lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs![i])) return lastResult;
    lastArgs = args;
    lastResult = fn(...args);
    return lastResult;
  };
}

export function groupBy<T, K extends string | number>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ??= []).push(it);
  }
  return out;
}

export function sumBy<T>(items: T[], fn: (t: T) => number) {
  let s = 0;
  for (const it of items) s += fn(it);
  return s;
}
