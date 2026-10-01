import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { NumericColumn } from '../../common/entities/columns';
import { TenantEntity } from '../../common/entities/tenant.entity';
import { Load } from '../../loads/load.entity';
import { TripStop } from './trip-stop.entity';
import { Trip } from './trip.entity';

export enum TripLoadStatus {
  ASSIGNED = 'ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  DELIVERED = 'DELIVERED',
  REMOVED = 'REMOVED',
}

/**
 * Allocation of a load onto a trip. organizationId is the carrier (trip owner); the load may belong
 * to another organization when the assignment originates from a marketplace booking.
 */
@Entity('trip_loads')
@Index(['loadId'], { unique: true, where: `"status" <> 'REMOVED'` })
@Index(['organizationId', 'tripId'])
@Index(['tripId', 'status'])
export class TripLoad extends TenantEntity {
  @Column('uuid')
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn()
  trip?: Relation<Trip>;

  @Column('uuid')
  loadId: string;

  @ManyToOne(() => Load, { onDelete: 'RESTRICT' })
  @JoinColumn()
  load?: Relation<Load>;

  @Column('uuid')
  pickupStopId: string;

  @ManyToOne(() => TripStop, { onDelete: 'RESTRICT' })
  @JoinColumn()
  pickupStop?: Relation<TripStop>;

  @Column('uuid')
  dropoffStopId: string;

  @ManyToOne(() => TripStop, { onDelete: 'RESTRICT' })
  @JoinColumn()
  dropoffStop?: Relation<TripStop>;

  @NumericColumn({ precision: 12, scale: 2 })
  allocatedWeightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  allocatedVolumeM3: number | null;

  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({
    type: 'enum',
    enum: TripLoadStatus,
    enumName: 'trip_load_status',
    default: TripLoadStatus.ASSIGNED,
  })
  status: TripLoadStatus;
}
