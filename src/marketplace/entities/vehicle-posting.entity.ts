import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { GeographyPointColumn, GeoPoint, NumericColumn } from '../../common/entities/columns';
import { SoftDeletableTenantEntity } from '../../common/entities/tenant.entity';
import { Location } from '../../locations/location.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { Vehicle } from '../../vehicles/vehicle.entity';
import { PostingStatus, PostingVisibility, PricingType } from './marketplace.enums';

/** Published available truck capacity. Origin/destination points are denormalized for GiST search. */
@Entity('vehicle_postings')
@Index(['organizationId', 'status'])
@Index(['status', 'departureFrom'], { where: `"status" IN ('OPEN', 'MATCHED')` })
@Index(['tripId'])
export class AvailableVehiclePosting extends SoftDeletableTenantEntity {
  @Column({ type: 'uuid', nullable: true })
  tripId: string | null;

  @ManyToOne(() => Trip, { onDelete: 'SET NULL' })
  @JoinColumn()
  trip?: Relation<Trip>;

  @Column({ type: 'uuid', nullable: true })
  vehicleId: string | null;

  @ManyToOne(() => Vehicle, { onDelete: 'SET NULL' })
  @JoinColumn()
  vehicle?: Relation<Vehicle>;

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

  @Index({ spatial: true })
  @GeographyPointColumn()
  originPoint: GeoPoint;

  @Index({ spatial: true })
  @GeographyPointColumn()
  destinationPoint: GeoPoint;

  @Column({ type: 'timestamptz' })
  departureFrom: Date;

  @Column({ type: 'timestamptz' })
  departureUntil: Date;

  @NumericColumn({ precision: 12, scale: 2 })
  availableWeightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  availableVolumeM3: number | null;

  @Column({ length: 40 })
  vehicleType: string;

  @NumericColumn({ precision: 14, scale: 2, nullable: true })
  askingPrice: number | null;

  @Column({ length: 3, default: 'PHP' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PricingType,
    enumName: 'pricing_type',
    default: PricingType.NEGOTIABLE,
  })
  pricingType: PricingType;

  @Column({
    type: 'enum',
    enum: PostingVisibility,
    enumName: 'posting_visibility',
    default: PostingVisibility.NETWORK,
  })
  visibility: PostingVisibility;

  @Column({
    type: 'enum',
    enum: PostingStatus,
    enumName: 'posting_status',
    default: PostingStatus.OPEN,
  })
  status: PostingStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
