import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation } from 'typeorm';
import { NumericColumn } from '../../common/entities/columns';
import { SoftDeletableTenantEntity } from '../../common/entities/tenant.entity';
import { Driver } from '../../drivers/driver.entity';
import { Location } from '../../locations/location.entity';
import { Vehicle } from '../../vehicles/vehicle.entity';
import { TripStop } from './trip-stop.entity';

export enum TripStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PLANNED = 'PLANNED',
  DISPATCHED = 'DISPATCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('trips')
@Index(['organizationId', 'tripNumber'], { unique: true })
@Index(['organizationId', 'status', 'scheduledDepartureAt'])
@Index(['vehicleId', 'status'])
@Index(['driverId', 'status'])
@Check('"available_weight_kg" >= 0 AND "available_weight_kg" <= "max_weight_kg"')
@Check('"available_volume_m3" IS NULL OR "available_volume_m3" >= 0')
export class Trip extends SoftDeletableTenantEntity {
  @Column({ length: 32 })
  tripNumber: string;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT' })
  @JoinColumn()
  vehicle?: Relation<Vehicle> | null;

  @Column({ type: 'uuid', nullable: true })
  driverId: string | null;

  @ManyToOne(() => Driver, { onDelete: 'RESTRICT' })
  @JoinColumn()
  driver?: Relation<Driver> | null;

  @Column('uuid')
  originLocationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn()
  originLocation?: Relation<Location>;

  @Column('uuid')
  destinationLocationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn()
  destinationLocation?: Relation<Location>;

  @Column({ type: 'timestamptz' })
  scheduledDepartureAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledArrivalAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualDepartureAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualArrivalAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedArrivalAt: Date | null;

  @NumericColumn({ precision: 12, scale: 2 })
  maxWeightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  maxVolumeM3: number | null;

  @NumericColumn({ precision: 12, scale: 2 })
  availableWeightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  availableVolumeM3: number | null;

  @Column({ type: 'enum', enum: TripStatus, enumName: 'trip_status', default: TripStatus.DRAFT })
  status: TripStatus;

  @Column({ default: false })
  isMarketplaceVisible: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => TripStop, (stop) => stop.trip)
  stops?: Relation<TripStop[]>;
}
