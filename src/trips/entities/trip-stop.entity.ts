import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { TenantEntity } from '../../common/entities/tenant.entity';
import { Location } from '../../locations/location.entity';
import { Trip } from './trip.entity';

export enum TripStopType {
  ORIGIN = 'ORIGIN',
  PICKUP = 'PICKUP',
  DROPOFF = 'DROPOFF',
  WAYPOINT = 'WAYPOINT',
  DESTINATION = 'DESTINATION',
}

export enum TripStopStatus {
  PENDING = 'PENDING',
  ARRIVED = 'ARRIVED',
  DEPARTED = 'DEPARTED',
  SKIPPED = 'SKIPPED',
}

@Entity('trip_stops')
@Unique(['tripId', 'sequence'], { deferrable: 'INITIALLY DEFERRED' })
@Index(['organizationId', 'tripId'])
export class TripStop extends TenantEntity {
  @Column('uuid')
  tripId: string;

  @ManyToOne(() => Trip, (trip) => trip.stops, { onDelete: 'CASCADE' })
  @JoinColumn()
  trip?: Relation<Trip>;

  @Column('int')
  sequence: number;

  @Column('uuid')
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn()
  location?: Relation<Location>;

  @Column({ type: 'enum', enum: TripStopType, enumName: 'trip_stop_type' })
  type: TripStopType;

  @Column({ type: 'timestamptz', nullable: true })
  plannedArrivalAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualArrivalAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  plannedDepartureAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualDepartureAt: Date | null;

  @Column({
    type: 'enum',
    enum: TripStopStatus,
    enumName: 'trip_stop_status',
    default: TripStopStatus.PENDING,
  })
  status: TripStopStatus;
}
