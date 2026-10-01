import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableTenantEntity } from '../common/entities/tenant.entity';

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('customers')
@Index(['organizationId', 'name'])
@Index(['organizationId', 'status'])
export class Customer extends SoftDeletableTenantEntity {
  @Column({ length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  companyName: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  taxId: string | null;

  @Column({ type: 'text', nullable: true })
  billingAddress: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: CustomerStatus,
    enumName: 'customer_status',
    default: CustomerStatus.ACTIVE,
  })
  status: CustomerStatus;
}
