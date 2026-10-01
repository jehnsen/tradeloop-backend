import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { NumericColumn } from '../../common/entities/columns';
import { CommissionType } from '../../common/enums';
import { Load } from '../../loads/load.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { AvailableLoadPosting } from './load-posting.entity';
import { MarketplaceOffer } from './marketplace-offer.entity';
import { BookingStatus } from './marketplace.enums';
import { AvailableVehiclePosting } from './vehicle-posting.entity';

/** Cross-tenant agreement between a shipper and a carrier; visible to both parties. */
@Entity('marketplace_bookings')
@Index(['bookingNumber'], { unique: true })
@Index(['loadPostingId'], { unique: true, where: `"status" <> 'CANCELLED'` })
@Index(['shipperOrganizationId', 'status', 'createdAt'])
@Index(['carrierOrganizationId', 'status', 'createdAt'])
@Index(['tripId'])
export class MarketplaceBooking extends AppBaseEntity {
  @Column({ length: 32 })
  bookingNumber: string;

  @Column('uuid')
  loadPostingId: string;

  @ManyToOne(() => AvailableLoadPosting, { onDelete: 'RESTRICT' })
  @JoinColumn()
  loadPosting?: Relation<AvailableLoadPosting>;

  @Column({ type: 'uuid', nullable: true })
  vehiclePostingId: string | null;

  @ManyToOne(() => AvailableVehiclePosting, { onDelete: 'RESTRICT' })
  @JoinColumn()
  vehiclePosting?: Relation<AvailableVehiclePosting>;

  @Column('uuid')
  offerId: string;

  @ManyToOne(() => MarketplaceOffer, { onDelete: 'RESTRICT' })
  @JoinColumn()
  offer?: Relation<MarketplaceOffer>;

  @Column('uuid')
  shipperOrganizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  shipperOrganization?: Relation<Organization>;

  @Column('uuid')
  carrierOrganizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  carrierOrganization?: Relation<Organization>;

  @Column('uuid')
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'RESTRICT' })
  @JoinColumn()
  trip?: Relation<Trip>;

  @Column('uuid')
  loadId: string;

  @ManyToOne(() => Load, { onDelete: 'RESTRICT' })
  @JoinColumn()
  load?: Relation<Load>;

  @NumericColumn({ precision: 14, scale: 2 })
  agreedAmount: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: CommissionType, enumName: 'commission_type' })
  platformCommissionType: CommissionType;

  @NumericColumn({ precision: 12, scale: 2 })
  platformCommissionValue: number;

  @NumericColumn({ precision: 14, scale: 2 })
  platformCommissionAmount: number;

  @NumericColumn({ precision: 14, scale: 2 })
  carrierNetAmount: number;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    enumName: 'booking_status',
    default: BookingStatus.CONFIRMED,
  })
  status: BookingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;
}
