import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { GeographyPointColumn, GeoPoint, NumericColumn } from '../../common/entities/columns';
import { SoftDeletableTenantEntity } from '../../common/entities/tenant.entity';
import { Load } from '../../loads/load.entity';
import { Location } from '../../locations/location.entity';
import { PostingStatus, PostingVisibility } from './marketplace.enums';

@Entity('load_postings')
@Index(['organizationId', 'status'])
@Index(['status', 'pickupFrom'], { where: `"status" IN ('OPEN', 'MATCHED')` })
@Index(['loadId'])
export class AvailableLoadPosting extends SoftDeletableTenantEntity {
  @Column({ type: 'uuid', nullable: true })
  loadId: string | null;

  @ManyToOne(() => Load, { onDelete: 'SET NULL' })
  @JoinColumn()
  load?: Relation<Load>;

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

  @Index({ spatial: true })
  @GeographyPointColumn()
  pickupPoint: GeoPoint;

  @Index({ spatial: true })
  @GeographyPointColumn()
  deliveryPoint: GeoPoint;

  @Column({ type: 'timestamptz' })
  pickupFrom: Date;

  @Column({ type: 'timestamptz' })
  pickupUntil: Date;

  @NumericColumn({ precision: 12, scale: 2 })
  weightKg: number;

  @NumericColumn({ precision: 10, scale: 2, nullable: true })
  volumeM3: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  requiredVehicleType: string | null;

  @NumericColumn({ precision: 14, scale: 2, nullable: true })
  budget: number | null;

  @Column({ length: 3, default: 'PHP' })
  currency: string;

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
