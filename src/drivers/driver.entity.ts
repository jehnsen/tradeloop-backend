import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { SoftDeletableTenantEntity } from '../common/entities/tenant.entity';
import { User } from '../users/entities/user.entity';

export enum DriverStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('drivers')
@Index(['organizationId', 'licenseNumber'], { unique: true, where: '"deleted_at" IS NULL' })
@Index(['organizationId', 'userId'], {
  unique: true,
  where: '"user_id" IS NOT NULL AND "deleted_at" IS NULL',
})
@Index(['organizationId', 'status'])
export class Driver extends SoftDeletableTenantEntity {
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn()
  user?: Relation<User>;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ length: 40 })
  licenseNumber: string;

  @Column({ type: 'date', nullable: true })
  licenseExpiry: string | null;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    enumName: 'driver_status',
    default: DriverStatus.ACTIVE,
  })
  status: DriverStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;
}
