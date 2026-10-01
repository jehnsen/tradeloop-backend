import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Organization } from './organization.entity';

/** Directed trust edge: organizationId shares PARTNERS_ONLY postings with partnerOrganizationId. */
@Entity('organization_partnerships')
@Unique(['organizationId', 'partnerOrganizationId'])
@Index(['partnerOrganizationId'])
export class OrganizationPartnership extends AppBaseEntity {
  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn()
  organization?: Relation<Organization>;

  @Column('uuid')
  partnerOrganizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn()
  partnerOrganization?: Relation<Organization>;
}
