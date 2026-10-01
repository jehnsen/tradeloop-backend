import { ShipmentStatus } from '../shipments/shipment.entity';
import { OrderStatus } from './order.entity';

const MOVING = [ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED];
const ARRANGED = [ShipmentStatus.PLANNED, ShipmentStatus.ASSIGNED];

/** Derives an order's progress from its shipments. Draft and terminal orders never change here. */
export function deriveOrderStatus(
  current: OrderStatus,
  shipmentStatuses: ShipmentStatus[],
): OrderStatus {
  if ([OrderStatus.DRAFT, OrderStatus.CANCELLED, OrderStatus.COMPLETED].includes(current))
    return current;
  const active = shipmentStatuses.filter((s) => s !== ShipmentStatus.CANCELLED);
  if (!active.length) return current;
  if (active.every((s) => s === ShipmentStatus.DELIVERED)) return OrderStatus.COMPLETED;
  if (active.some((s) => MOVING.includes(s))) return OrderStatus.IN_TRANSIT;
  if (active.some((s) => ARRANGED.includes(s))) return OrderStatus.PROCESSING;
  return current;
}
