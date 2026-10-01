import { HttpStatus } from '@nestjs/common';
import { AppException, invalidTransition } from '../common/http/app.exception';
import { TripStatus } from './entities/trip.entity';

export type TripAction = 'open' | 'plan' | 'dispatch' | 'start' | 'complete' | 'cancel';

const { DRAFT, OPEN, PLANNED, DISPATCHED, IN_PROGRESS, COMPLETED, CANCELLED } = TripStatus;

export const TRIP_TRANSITIONS: Record<TripAction, { from: TripStatus[]; to: TripStatus }> = {
  open: { from: [DRAFT], to: OPEN },
  plan: { from: [DRAFT, OPEN], to: PLANNED },
  dispatch: { from: [DRAFT, OPEN, PLANNED], to: DISPATCHED },
  start: { from: [DISPATCHED], to: IN_PROGRESS },
  complete: { from: [IN_PROGRESS], to: COMPLETED },
  cancel: { from: [DRAFT, OPEN, PLANNED, DISPATCHED], to: CANCELLED },
};

/** Trip statuses in which the load plan (assignments, stops, capacity) may still change. */
export const PLANNING_STATUSES: TripStatus[] = [DRAFT, OPEN, PLANNED];
export const ACTIVE_STATUSES: TripStatus[] = [DISPATCHED, IN_PROGRESS];
export const TERMINAL_STATUSES: TripStatus[] = [COMPLETED, CANCELLED];

export function nextTripStatus(current: TripStatus, action: TripAction): TripStatus {
  const rule = TRIP_TRANSITIONS[action];
  if (!rule.from.includes(current)) throw invalidTransition('trip', current, action);
  return rule.to;
}

export interface TripCapacity {
  maxWeightKg: number;
  maxVolumeM3: number | null;
  availableWeightKg: number;
  availableVolumeM3: number | null;
}

const toCents = (v: number) => Math.round(v * 100);
const fromCents = (v: number) => v / 100;

export const capacityExceeded = (message: string) =>
  new AppException(HttpStatus.CONFLICT, 'CAPACITY_EXCEEDED', message);

/** Reserves weight/volume on a trip. Volume is unconstrained when the trip has no volume limit. */
export function allocateCapacity(
  cap: TripCapacity,
  weightKg: number,
  volumeM3: number | null,
): TripCapacity {
  if (weightKg <= 0) throw capacityExceeded('Allocated weight must be positive');
  const weightLeft = toCents(cap.availableWeightKg) - toCents(weightKg);
  if (weightLeft < 0) {
    throw capacityExceeded(
      `Load weight ${weightKg} kg exceeds available trip capacity ${cap.availableWeightKg} kg`,
    );
  }
  let volumeLeft = cap.availableVolumeM3;
  if (cap.availableVolumeM3 !== null && volumeM3 !== null && volumeM3 !== undefined) {
    const left = toCents(cap.availableVolumeM3) - toCents(volumeM3);
    if (left < 0) {
      throw capacityExceeded(
        `Load volume ${volumeM3} m3 exceeds available trip capacity ${cap.availableVolumeM3} m3`,
      );
    }
    volumeLeft = fromCents(left);
  }
  return { ...cap, availableWeightKg: fromCents(weightLeft), availableVolumeM3: volumeLeft };
}

/** Returns previously allocated capacity to a trip, never exceeding its maximum. */
export function releaseCapacity(
  cap: TripCapacity,
  weightKg: number,
  volumeM3: number | null,
): TripCapacity {
  const weight = Math.min(
    toCents(cap.maxWeightKg),
    toCents(cap.availableWeightKg) + toCents(weightKg),
  );
  let volume = cap.availableVolumeM3;
  if (cap.availableVolumeM3 !== null && volumeM3 !== null && volumeM3 !== undefined) {
    const max = cap.maxVolumeM3 === null ? Number.MAX_SAFE_INTEGER : toCents(cap.maxVolumeM3);
    volume = fromCents(Math.min(max, toCents(cap.availableVolumeM3) + toCents(volumeM3)));
  }
  return { ...cap, availableWeightKg: fromCents(weight), availableVolumeM3: volume };
}

/** Recomputes availability after the trip maximum changes, given what is already allocated. */
export function resizeCapacity(
  cap: TripCapacity,
  newMaxWeightKg: number,
  newMaxVolumeM3: number | null,
): TripCapacity {
  const allocatedWeight = toCents(cap.maxWeightKg) - toCents(cap.availableWeightKg);
  const availableWeight = toCents(newMaxWeightKg) - allocatedWeight;
  if (availableWeight < 0)
    throw capacityExceeded('New maximum weight is below the weight already allocated');
  let availableVolume: number | null = null;
  if (newMaxVolumeM3 !== null) {
    const allocatedVolume =
      cap.maxVolumeM3 !== null && cap.availableVolumeM3 !== null
        ? toCents(cap.maxVolumeM3) - toCents(cap.availableVolumeM3)
        : 0;
    const v = toCents(newMaxVolumeM3) - allocatedVolume;
    if (v < 0) throw capacityExceeded('New maximum volume is below the volume already allocated');
    availableVolume = fromCents(v);
  }
  return {
    maxWeightKg: newMaxWeightKg,
    maxVolumeM3: newMaxVolumeM3,
    availableWeightKg: fromCents(availableWeight),
    availableVolumeM3: availableVolume,
  };
}
