import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AppBaseEntity } from '../common/entities/base.entity';
import { GeographyPointColumn, GeoPoint, NumericColumn } from '../common/entities/columns';
import { Organization } from '../organizations/entities/organization.entity';

export enum LocationType {
  WAREHOUSE = 'WAREHOUSE',
  DEPOT = 'DEPOT',
  CUSTOMER = 'CUSTOMER',
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
  OTHER = 'OTHER',
}

/** organizationId = null marks a platform-wide shared location (managed by platform admins). */
@Entity('locations')
@Index(['organizationId', 'type'])
@Index(['province', 'city'])
export class Location extends AppBaseEntity {
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  organization?: Relation<Organization>;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  addressLine: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  barangay: string | null;

  @Column({ length: 120 })
  city: string;

  @Column({ length: 120 })
  province: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ length: 2, default: 'PH' })
  country: string;

  @NumericColumn({ precision: 9, scale: 6 })
  latitude: number;

  @NumericColumn({ precision: 9, scale: 6 })
  longitude: number;

  @Index({ spatial: true })
  @GeographyPointColumn()
  location: GeoPoint;

  @Column({
    type: 'enum',
    enum: LocationType,
    enumName: 'location_type',
    default: LocationType.OTHER,
  })
  type: LocationType;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
