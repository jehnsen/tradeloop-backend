import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { NumericColumn } from '../../common/entities/columns';
import { TenantEntity } from '../../common/entities/tenant.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { AvailableLoadPosting } from './load-posting.entity';
import { OfferStatus } from './marketplace.enums';
import { AvailableVehiclePosting } from './vehicle-posting.entity';

/** organizationId is the owning (creating) tenant; targetOrganizationId is the counterparty. */
@Entity('marketplace_offers')
@Index(['targetOrganizationId', 'status', 'createdAt'])
@Index(['createdByOrganizationId', 'status', 'createdAt'])
@Index(['loadPostingId', 'status'])
@Index(['vehiclePostingId', 'status'])
@Index(['loadPostingId'], { unique: true, where: `"status" = 'ACCEPTED'` })
export class MarketplaceOffer extends TenantEntity {
  @Column('uuid')
  createdByOrganizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  createdByOrganization?: Relation<Organization>;

  @Column('uuid')
  targetOrganizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  targetOrganization?: Relation<Organization>;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  vehiclePostingId: string | null;

  @ManyToOne(() => AvailableVehiclePosting, { onDelete: 'RESTRICT' })
  @JoinColumn()
  vehiclePosting?: Relation<AvailableVehiclePosting>;

  @Column({ type: 'uuid', nullable: true })
  loadPostingId: string | null;

  @ManyToOne(() => AvailableLoadPosting, { onDelete: 'RESTRICT' })
  @JoinColumn()
  loadPosting?: Relation<AvailableLoadPosting>;

  @Column({ type: 'uuid', nullable: true })
  parentOfferId: string | null;

  @ManyToOne(() => MarketplaceOffer, { onDelete: 'SET NULL' })
  @JoinColumn()
  parentOffer?: Relation<MarketplaceOffer>;

  @NumericColumn({ precision: 14, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'PHP' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    type: 'enum',
    enum: OfferStatus,
    enumName: 'offer_status',
    default: OfferStatus.PENDING,
  })
  status: OfferStatus;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}
