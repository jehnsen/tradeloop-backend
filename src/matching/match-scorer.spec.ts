import { MatchingConfig } from '../common/config/configuration';
import { HeuristicMatchScorer, LoadSide, MatchGeometry, VehicleSide } from './match-scorer';

const config: MatchingConfig = {
  weights: { route: 30, vehicle: 20, capacity: 15, schedule: 15, pickup: 10, dropoff: 10 },
  minScore: 40,
  corridorKm: 50,
  proximityRadiusKm: 100,
  scheduleToleranceHours: 48,
};

const t = (h: number) => new Date(Date.UTC(2026, 9, 1, h));

const vehicle: VehicleSide = {
  availableWeightKg: 10_000,
  availableVolumeM3: 40,
  vehicleType: '10W_TRUCK',
  departureFrom: t(6),
  departureUntil: t(10),
};

const load: LoadSide = {
  weightKg: 8_000,
  volumeM3: 20,
  requiredVehicleType: null,
  pickupFrom: t(8),
  pickupUntil: t(12),
};

/** Manila -> Batangas truck; load picked up at the origin and dropped at the destination. */
const sameRoute: MatchGeometry = {
  originToPickupKm: 0,
  pickupToDropoffKm: 100,
  dropoffToDestinationKm: 0,
  originToDestinationKm: 100,
  pickupToDestinationKm: 100,
};

describe('HeuristicMatchScorer', () => {
  const scorer = new HeuristicMatchScorer(config);

  it('gives a perfect-route, perfect-fit pair a high score with zero detour', () => {
    const r = scorer.score(load, vehicle, sameRoute);
    expect(r.eligible).toBe(true);
    expect(r.estimatedPickupDetourKm).toBe(0);
    expect(r.estimatedDropoffDetourKm).toBe(0);
    // capacity = 0.6 + 0.4 * 0.8 = 0.92 -> 15 * 0.92 = 13.8; everything else full.
    expect(r.score).toBe(Math.round(30 + 20 + 13.8 + 15 + 10 + 10));
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('computes pickup and dropoff detours from straight-line geometry', () => {
    const geo: MatchGeometry = {
      originToPickupKm: 30,
      pickupToDestinationKm: 80,
      pickupToDropoffKm: 50,
      dropoffToDestinationKm: 40,
      originToDestinationKm: 100,
    };
    const r = scorer.score(load, vehicle, geo);
    expect(r.estimatedPickupDetourKm).toBe(10); // 30 + 80 - 100
    expect(r.estimatedDropoffDetourKm).toBe(10); // 50 + 40 - 80
  });

  it('scores a long detour lower than an on-route load', () => {
    const detour: MatchGeometry = {
      ...sameRoute,
      originToPickupKm: 90,
      pickupToDestinationKm: 150,
    };
    expect(scorer.score(load, vehicle, detour).score).toBeLessThan(
      scorer.score(load, vehicle, sameRoute).score,
    );
  });

  it('marks wrong vehicle type ineligible', () => {
    const r = scorer.score({ ...load, requiredVehicleType: 'REFRIGERATED' }, vehicle, sameRoute);
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(' ')).toContain('REFRIGERATED');
  });

  it('marks insufficient weight or volume ineligible', () => {
    expect(scorer.score({ ...load, weightKg: 10_001 }, vehicle, sameRoute).eligible).toBe(false);
    expect(scorer.score({ ...load, volumeM3: 41 }, vehicle, sameRoute).eligible).toBe(false);
  });

  it('decays schedule compatibility with the gap and rejects beyond tolerance', () => {
    const near = scorer.score(
      { ...load, pickupFrom: t(22), pickupUntil: t(23) },
      vehicle,
      sameRoute,
    );
    expect(near.eligible).toBe(true);
    expect(near.score).toBeLessThan(scorer.score(load, vehicle, sameRoute).score);
    const far = scorer.score(
      { ...load, pickupFrom: t(70), pickupUntil: t(71) },
      vehicle,
      sameRoute,
    );
    expect(far.eligible).toBe(false);
  });

  it('respects configurable weights', () => {
    const routeOnly = new HeuristicMatchScorer({
      ...config,
      weights: { route: 1, vehicle: 0, capacity: 0, schedule: 0, pickup: 0, dropoff: 0 },
    });
    expect(routeOnly.score(load, vehicle, sameRoute).score).toBe(100);
    const opposite: MatchGeometry = {
      originToPickupKm: 100,
      pickupToDestinationKm: 200,
      pickupToDropoffKm: 200,
      dropoffToDestinationKm: 0,
      originToDestinationKm: 100,
    };
    expect(routeOnly.score(load, vehicle, opposite).score).toBe(0);
  });

  it('always returns a score within 0..100', () => {
    for (const geo of [
      sameRoute,
      { ...sameRoute, originToPickupKm: 1_000, dropoffToDestinationKm: 1_000 },
    ]) {
      const { score } = scorer.score(load, vehicle, geo);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
