import { Column, DeleteDateColumn, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { AppBaseEntity } from './base.entity';

export abstract class TenantEntity extends AppBaseEntity {
  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  organization?: Relation<Organization>;
}

export abstract class SoftDeletableTenantEntity extends TenantEntity {
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
