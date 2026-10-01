import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { NumericColumn } from '../../common/entities/columns';
import { CommissionType, OrganizationType } from '../../common/enums';

export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
}

@Entity('organizations')
@Index(['type', 'status'])
export class Organization extends AppBaseEntity {
  @Column({ length: 200 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 40 })
  code: string;

  @Column({ type: 'enum', enum: OrganizationType, enumName: 'organization_type' })
  type: OrganizationType;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    enumName: 'organization_status',
    default: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ type: 'enum', enum: CommissionType, enumName: 'commission_type', nullable: true })
  commissionType: CommissionType | null;

  @NumericColumn({ precision: 12, scale: 2, nullable: true })
  commissionValue: number | null;
}
