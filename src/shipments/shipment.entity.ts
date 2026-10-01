import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { SoftDeletableTenantEntity } from '../common/entities/tenant.entity';
import { Location } from '../locations/location.entity';
import { Order } from '../orders/order.entity';

export enum ShipmentStatus {
  PENDING = 'PENDING',
  PLANNED = 'PLANNED',
  ASSIGNED = 'ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('shipments')
@Index(['organizationId', 'shipmentNumber'], { unique: true })
@Index(['organizationId', 'status', 'createdAt'])
@Index(['orderId'])
export class Shipment extends SoftDeletableTenantEntity {
  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn()
  order?: Relation<Order>;

  @Column({ length: 32 })
  shipmentNumber: string;

  @Column('uuid')
  pickupLocationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn()
  pickupLocation?: Relation<Location>;

  @Column('uuid')
  deliveryLocationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn()
  deliveryLocation?: Relation<Location>;

  @Column({ type: 'timestamptz', nullable: true })
  pickupWindowStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pickupWindowEnd: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryWindowStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryWindowEnd: Date | null;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipment_status',
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({ type: 'text', nullable: true })
  cargoDescription: string | null;

  @Column({ type: 'text', nullable: true })
  specialInstructions: string | null;
}
