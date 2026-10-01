import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { NumericColumn } from '../common/entities/columns';
import { SoftDeletableTenantEntity } from '../common/entities/tenant.entity';
import { Shipment } from '../shipments/shipment.entity';

export enum LoadStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('loads')
@Index(['organizationId', 'status', 'createdAt'])
@Index(['organizationId', 'cargoType'])
@Index(['shipmentId'])
export class Load extends SoftDeletableTenantEntity {
  @Column({ type: 'uuid', nullable: true })
  shipmentId: string | null;

  @ManyToOne(() => Shipment, { onDelete: 'RESTRICT' })
  @JoinColumn()
  shipment?: Relation<Shipment>;

  @Column({ length: 300 })
  description: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  cargoType: string | null;

  @NumericColumn({ precision: 12, scale: 2 })
  weightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  volumeM3: number | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  unit: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  requiredVehicleType: string | null;

  @Column({ default: false })
  temperatureControlled: boolean;

  @Column({ default: false })
  hazardous: boolean;

  @Column({ type: 'enum', enum: LoadStatus, enumName: 'load_status', default: LoadStatus.PENDING })
  status: LoadStatus;
}
