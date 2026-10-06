import { addMinutes, format, parseISO } from 'date-fns';

/** Operations time as the screens use it: local Philippine time, "YYYY-MM-DDTHH:mm". */
export interface OpsClock {
  now(): string;
  /** Advance the clock for a recorded event and return the event time. */
  stamp(): string;
  /** Minutes the anchored clock has advanced (persisted per organization). */
  readonly tick: number;
}

const MINUTES_PER_EVENT = 2;

/**
 * Demo clock: frozen at the seed's "now" and moved forward two minutes per recorded event, so
 * new events always sort after the seeded ones and "today" stays the seeded day.
 */
export function anchoredClock(anchor: string, startTick: number): OpsClock {
  let tick = startTick;
  const at = () => format(addMinutes(parseISO(anchor), tick), "yyyy-MM-dd'T'HH:mm");
  return {
    now: at,
    stamp() {
      tick += MINUTES_PER_EVENT;
      return at();
    },
    get tick() {
      return tick;
    },
  };
}

const MANILA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Wall-clock time in Manila. */
export function manilaNow(date = new Date()): string {
  const p = Object.fromEntries(MANILA.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function realClock(): OpsClock {
  return { now: () => manilaNow(), stamp: () => manilaNow(), tick: 0 };
}
