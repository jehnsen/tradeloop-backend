import { LoadStatus } from '../loads/load.entity';
import { ShipmentStatus } from './shipment.entity';

const LOCKED = [ShipmentStatus.CANCELLED, ShipmentStatus.FAILED, ShipmentStatus.DELIVERED];

/** Derives a shipment's status from the statuses of its loads. */
export function deriveShipmentStatus(
  current: ShipmentStatus,
  loadStatuses: LoadStatus[],
): ShipmentStatus {
  if (LOCKED.includes(current)) return current;
  const active = loadStatuses.filter((s) => s !== LoadStatus.CANCELLED);
  if (!active.length) return current;
  if (active.every((s) => s === LoadStatus.DELIVERED)) return ShipmentStatus.DELIVERED;
  if (active.some((s) => s === LoadStatus.IN_TRANSIT || s === LoadStatus.DELIVERED))
    return ShipmentStatus.IN_TRANSIT;
  if (active.some((s) => s === LoadStatus.ASSIGNED)) return ShipmentStatus.ASSIGNED;
  return current === ShipmentStatus.ASSIGNED ? ShipmentStatus.PENDING : current;
}
