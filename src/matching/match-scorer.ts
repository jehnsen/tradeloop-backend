import { MatchingConfig } from '../common/config/configuration';
import { round } from '../common/geo/geo';

export interface MatchGeometry {
  originToPickupKm: number;
  pickupToDropoffKm: number;
  dropoffToDestinationKm: number;
  originToDestinationKm: number;
  pickupToDestinationKm: number;
}

export interface LoadSide {
  weightKg: number;
  volumeM3: number | null;
  requiredVehicleType: string | null;
  pickupFrom: Date;
  pickupUntil: Date;
}

export interface VehicleSide {
  availableWeightKg: number;
  availableVolumeM3: number | null;
  vehicleType: string;
  departureFrom: Date;
  departureUntil: Date;
}

export interface MatchScore {
  score: number;
  eligible: boolean;
  reasons: string[];
  estimatedPickupDetourKm: number;
  estimatedDropoffDetourKm: number;
}

/**
 * Scoring strategy behind an abstract class so a routing-, ETA- or ML-based implementation can be
 * swapped in through DI without changing callers.
 */
export abstract class MatchScorer {
  abstract score(load: LoadSide, vehicle: VehicleSide, geo: MatchGeometry): MatchScore;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const HOUR_MS = 3_600_000;

/** Deterministic straight-line heuristic. Weights are relative and normalized to 100. */
export class HeuristicMatchScorer extends MatchScorer {
  constructor(private readonly config: MatchingConfig) {
    super();
  }

  score(load: LoadSide, vehicle: VehicleSide, geo: MatchGeometry): MatchScore {
    const reasons: string[] = [];
    let eligible = true;
    const w = this.config.weights;

    const pickupDetour = Math.max(
      0,
      geo.originToPickupKm + geo.pickupToDestinationKm - geo.originToDestinationKm,
    );
    const dropoffDetour = Math.max(
      0,
      geo.pickupToDropoffKm + geo.dropoffToDestinationKm - geo.pickupToDestinationKm,
    );
    const totalDetour = pickupDetour + dropoffDetour;

    const route = clamp01(1 - totalDetour / Math.max(geo.originToDestinationKm, 1));
    reasons.push(
      route >= 0.5
        ? `Load is along the truck route (+${round(totalDetour, 1)} km detour)`
        : `Significant detour of ${round(totalDetour, 1)} km`,
    );

    let vehicleScore = 1;
    if (!load.requiredVehicleType) reasons.push('No specific vehicle type required');
    else if (load.requiredVehicleType === vehicle.vehicleType)
      reasons.push(`Vehicle type ${vehicle.vehicleType} matches`);
    else {
      vehicleScore = 0;
      eligible = false;
      reasons.push(`Requires ${load.requiredVehicleType}, truck is ${vehicle.vehicleType}`);
    }

    let capacity = 0;
    const volumeFits =
      load.volumeM3 === null ||
      vehicle.availableVolumeM3 === null ||
      load.volumeM3 <= vehicle.availableVolumeM3;
    if (load.weightKg > vehicle.availableWeightKg || !volumeFits) {
      eligible = false;
      reasons.push('Insufficient available capacity');
    } else {
      const utilization = load.weightKg / vehicle.availableWeightKg;
      capacity = 0.6 + 0.4 * utilization;
      reasons.push(`Uses ${Math.round(utilization * 100)}% of available weight capacity`);
    }

    const gapMs = Math.max(
      0,
      load.pickupFrom.getTime() - vehicle.departureUntil.getTime(),
      vehicle.departureFrom.getTime() - load.pickupUntil.getTime(),
    );
    const gapHours = gapMs / HOUR_MS;
    const tolerance = Math.max(this.config.scheduleToleranceHours, 1);
    const schedule = gapMs === 0 ? 1 : clamp01(1 - gapHours / tolerance);
    if (gapMs === 0) reasons.push('Departure and pickup windows overlap');
    else if (gapHours <= tolerance) reasons.push(`Schedules are ${round(gapHours, 1)} h apart`);
    else {
      eligible = false;
      reasons.push(`Schedules are ${round(gapHours, 1)} h apart (beyond tolerance)`);
    }

    const radius = Math.max(this.config.proximityRadiusKm, 1);
    const pickup = clamp01(1 - geo.originToPickupKm / radius);
    const dropoff = clamp01(1 - geo.dropoffToDestinationKm / radius);
    reasons.push(`Pickup is ${round(geo.originToPickupKm, 1)} km from truck origin`);
    reasons.push(`Dropoff is ${round(geo.dropoffToDestinationKm, 1)} km from truck destination`);

    const totalWeight = w.route + w.vehicle + w.capacity + w.schedule + w.pickup + w.dropoff || 1;
    const weighted =
      w.route * route +
      w.vehicle * vehicleScore +
      w.capacity * capacity +
      w.schedule * schedule +
      w.pickup * pickup +
      w.dropoff * dropoff;

    return {
      score: Math.round((weighted / totalWeight) * 100),
      eligible,
      reasons,
      estimatedPickupDetourKm: round(pickupDetour),
      estimatedDropoffDetourKm: round(dropoffDetour),
    };
  }
}
