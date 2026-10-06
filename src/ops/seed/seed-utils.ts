/** Deterministic helpers shared by the demo data generators. */
import { addDays, addMinutes, format, getDay, parseISO } from 'date-fns';

export function createRandom(seed: number) {
  let a = seed;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rint = (lo: number, hi: number) => Math.floor(rand() * (hi - lo + 1)) + lo;
  const rfloat = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const chance = (p: number) => rand() < p;
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const shuffle = <T>(arr: readonly T[]) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { rand, rint, rfloat, chance, pick, shuffle };
}

export const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
export const pad = (n: number, w = 3) => String(n).padStart(w, '0');

export const fmtD = (d: Date) => format(d, 'yyyy-MM-dd');
export const fmtDT = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
export const addDaysISO = (iso: string, n: number) => fmtD(addDays(parseISO(iso), n));
export const at = (iso: string, hhmm: string) => `${iso}T${hhmm}`;
export const plusMin = (dt: string, m: number) => fmtDT(addMinutes(parseISO(dt), m));
/** "2026-09-25" → "260925" for readable IDs. */
export const yymmdd = (iso: string) => iso.slice(2, 10).replace(/-/g, '');
/** 0 = Sunday. */
export const weekdayOf = (iso: string) => getDay(parseISO(iso));
