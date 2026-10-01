import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { GeographyPointColumn, GeoPoint, NumericColumn } from '../common/entities/columns';
import { Organization } from '../organizations/entities/organization.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

export enum LocationSource {
  DRIVER_APP = 'DRIVER_APP',
  GPS_DEVICE = 'GPS_DEVICE',
  MANUAL = 'MANUAL',
  INTEGRATION = 'INTEGRATION',
}

@Entity('vehicle_locations')
@Index(['vehicleId', 'recordedAt'])
@Index(['tripId', 'recordedAt'], { where: '"trip_id" IS NOT NULL' })
@Index(['organizationId', 'recordedAt'])
export class VehicleLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn()
  organization?: Relation<Organization>;

  @Column('uuid')
  vehicleId: string;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn()
  vehicle?: Relation<Vehicle>;

  @Column({ type: 'uuid', nullable: true })
  tripId: string | null;

  @ManyToOne(() => Trip, { onDelete: 'SET NULL' })
  @JoinColumn()
  trip?: Relation<Trip>;

  @NumericColumn({ precision: 9, scale: 6 })
  latitude: number;

  @NumericColumn({ precision: 9, scale: 6 })
  longitude: number;

  @Index({ spatial: true })
  @GeographyPointColumn()
  location: GeoPoint;

  @NumericColumn({ precision: 6, scale: 2, nullable: true })
  speedKph: number | null;

  @NumericColumn({ precision: 5, scale: 2, nullable: true })
  heading: number | null;

  @NumericColumn({ precision: 8, scale: 2, nullable: true })
  accuracyMeters: number | null;

  @Column({ type: 'timestamptz' })
  recordedAt: Date;

  @Column({
    type: 'enum',
    enum: LocationSource,
    enumName: 'location_source',
    default: LocationSource.DRIVER_APP,
  })
  source: LocationSource;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
