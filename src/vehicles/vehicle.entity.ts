import { Column, Entity, Index } from 'typeorm';
import { NumericColumn } from '../common/entities/columns';
import { SoftDeletableTenantEntity } from '../common/entities/tenant.entity';

export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE',
  IN_USE = 'IN_USE',
  MAINTENANCE = 'MAINTENANCE',
  INACTIVE = 'INACTIVE',
}

@Entity('vehicles')
@Index(['organizationId', 'plateNumber'], { unique: true, where: '"deleted_at" IS NULL' })
@Index(['organizationId', 'status'])
@Index(['organizationId', 'vehicleType'])
export class Vehicle extends SoftDeletableTenantEntity {
  @Column({ length: 20 })
  plateNumber: string;

  /** Stored as text so new vehicle classes can be added without a schema change. */
  @Column({ length: 40 })
  vehicleType: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  make: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  @NumericColumn({ precision: 12, scale: 2 })
  maxWeightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  maxVolumeM3: number | null;

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    enumName: 'vehicle_status',
    default: VehicleStatus.AVAILABLE,
  })
  status: VehicleStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gpsDeviceId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;
}
