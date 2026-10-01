import { LoadStatus } from '../loads/load.entity';
import { deriveShipmentStatus } from '../shipments/shipment-status';
import { ShipmentStatus } from '../shipments/shipment.entity';
import { deriveOrderStatus } from './order-status';
import { OrderStatus } from './order.entity';

describe('status derivation', () => {
  it('progresses orders from shipments', () => {
    expect(
      deriveOrderStatus(OrderStatus.CONFIRMED, [ShipmentStatus.ASSIGNED, ShipmentStatus.PENDING]),
    ).toBe(OrderStatus.PROCESSING);
    expect(
      deriveOrderStatus(OrderStatus.PROCESSING, [
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.ASSIGNED,
      ]),
    ).toBe(OrderStatus.IN_TRANSIT);
    expect(
      deriveOrderStatus(OrderStatus.IN_TRANSIT, [
        ShipmentStatus.DELIVERED,
        ShipmentStatus.CANCELLED,
      ]),
    ).toBe(OrderStatus.COMPLETED);
  });

  it('never moves draft or terminal orders', () => {
    expect(deriveOrderStatus(OrderStatus.DRAFT, [ShipmentStatus.DELIVERED])).toBe(
      OrderStatus.DRAFT,
    );
    expect(deriveOrderStatus(OrderStatus.CANCELLED, [ShipmentStatus.DELIVERED])).toBe(
      OrderStatus.CANCELLED,
    );
  });

  it('progresses shipments from loads', () => {
    expect(
      deriveShipmentStatus(ShipmentStatus.PENDING, [LoadStatus.ASSIGNED, LoadStatus.PENDING]),
    ).toBe(ShipmentStatus.ASSIGNED);
    expect(deriveShipmentStatus(ShipmentStatus.ASSIGNED, [LoadStatus.IN_TRANSIT])).toBe(
      ShipmentStatus.IN_TRANSIT,
    );
    expect(
      deriveShipmentStatus(ShipmentStatus.IN_TRANSIT, [LoadStatus.DELIVERED, LoadStatus.CANCELLED]),
    ).toBe(ShipmentStatus.DELIVERED);
    expect(deriveShipmentStatus(ShipmentStatus.ASSIGNED, [LoadStatus.PENDING])).toBe(
      ShipmentStatus.PENDING,
    );
    expect(deriveShipmentStatus(ShipmentStatus.FAILED, [LoadStatus.DELIVERED])).toBe(
      ShipmentStatus.FAILED,
    );
  });
});
