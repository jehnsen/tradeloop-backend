import { TripStatus } from './entities/trip.entity';
import {
  allocateCapacity,
  nextTripStatus,
  releaseCapacity,
  resizeCapacity,
  TRIP_TRANSITIONS,
  TripAction,
  TripCapacity,
} from './trip-state';

describe('trip state machine', () => {
  const allowed: Array<[TripStatus, TripAction, TripStatus]> = [
    [TripStatus.DRAFT, 'open', TripStatus.OPEN],
    [TripStatus.OPEN, 'plan', TripStatus.PLANNED],
    [TripStatus.DRAFT, 'dispatch', TripStatus.DISPATCHED],
    [TripStatus.PLANNED, 'dispatch', TripStatus.DISPATCHED],
    [TripStatus.DISPATCHED, 'start', TripStatus.IN_PROGRESS],
    [TripStatus.IN_PROGRESS, 'complete', TripStatus.COMPLETED],
    [TripStatus.DISPATCHED, 'cancel', TripStatus.CANCELLED],
  ];

  it.each(allowed)('%s --%s--> %s', (from, action, to) => {
    expect(nextTripStatus(from, action)).toBe(to);
  });

  const rejected: Array<[TripStatus, TripAction]> = [
    [TripStatus.DRAFT, 'start'],
    [TripStatus.DRAFT, 'complete'],
    [TripStatus.OPEN, 'open'],
    [TripStatus.IN_PROGRESS, 'cancel'],
    [TripStatus.IN_PROGRESS, 'dispatch'],
    [TripStatus.COMPLETED, 'cancel'],
    [TripStatus.COMPLETED, 'start'],
    [TripStatus.CANCELLED, 'open'],
  ];

  it.each(rejected)('rejects %s --%s-->', (from, action) => {
    expect(() => nextTripStatus(from, action)).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
  });

  it('never allows leaving a terminal status', () => {
    for (const rule of Object.values(TRIP_TRANSITIONS)) {
      expect(rule.from).not.toContain(TripStatus.COMPLETED);
      expect(rule.from).not.toContain(TripStatus.CANCELLED);
    }
  });
});

describe('trip capacity', () => {
  const cap: TripCapacity = {
    maxWeightKg: 10_000,
    maxVolumeM3: 40,
    availableWeightKg: 10_000,
    availableVolumeM3: 40,
  };

  it('reserves weight and volume', () => {
    expect(allocateCapacity(cap, 2_500.5, 10.25)).toEqual({
      ...cap,
      availableWeightKg: 7_499.5,
      availableVolumeM3: 29.75,
    });
  });

  it('allows filling exactly to zero without floating point drift', () => {
    let c: TripCapacity = { ...cap, availableWeightKg: 3 };
    for (let i = 0; i < 30; i++) c = allocateCapacity(c, 0.1, null);
    expect(c.availableWeightKg).toBe(0);
    expect(() => allocateCapacity(c, 0.01, null)).toThrow(
      expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }),
    );
    expect(
      allocateCapacity({ ...cap, availableWeightKg: 0.3 }, 0.1 + 0.2, null).availableWeightKg,
    ).toBe(0);
  });

  it('rejects weight above availability', () => {
    expect(() => allocateCapacity({ ...cap, availableWeightKg: 999.99 }, 1_000, null)).toThrow(
      expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }),
    );
  });

  it('rejects volume above availability', () => {
    expect(() => allocateCapacity({ ...cap, availableVolumeM3: 5 }, 100, 6)).toThrow(
      expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }),
    );
  });

  it('ignores volume when the trip has no volume limit', () => {
    expect(
      allocateCapacity({ ...cap, maxVolumeM3: null, availableVolumeM3: null }, 100, 999)
        .availableVolumeM3,
    ).toBeNull();
  });

  it('rejects non-positive allocations', () => {
    expect(() => allocateCapacity(cap, 0, null)).toThrow();
  });

  it('releases capacity but never above the maximum', () => {
    const used = allocateCapacity(cap, 4_000, 10);
    expect(releaseCapacity(used, 4_000, 10)).toEqual(cap);
    expect(releaseCapacity(cap, 4_000, 10)).toEqual(cap);
  });

  it('resizes keeping existing allocations', () => {
    const used = allocateCapacity(cap, 4_000, 10);
    expect(resizeCapacity(used, 6_000, 20)).toEqual({
      maxWeightKg: 6_000,
      maxVolumeM3: 20,
      availableWeightKg: 2_000,
      availableVolumeM3: 10,
    });
    expect(() => resizeCapacity(used, 3_000, 20)).toThrow(
      expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }),
    );
  });
});
