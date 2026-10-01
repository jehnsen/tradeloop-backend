import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { SoftDeletableTenantEntity } from '../common/entities/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { User } from '../users/entities/user.entity';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
@Index(['organizationId', 'orderNumber'], { unique: true })
@Index(['organizationId', 'status', 'createdAt'])
@Index(['organizationId', 'customerId'])
@Index(['organizationId', 'externalReference'], { where: '"external_reference" IS NOT NULL' })
export class Order extends SoftDeletableTenantEntity {
  @Column('uuid')
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn()
  customer?: Relation<Customer>;

  @Column({ length: 32 })
  orderNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalReference: string | null;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status', default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ type: 'timestamptz', nullable: true })
  requestedPickupAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  requestedDeliveryAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: Relation<User>;
}
