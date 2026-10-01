import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { Role } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Organization } from './organization.entity';

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  SUSPENDED = 'SUSPENDED',
}

@Entity('organization_memberships')
@Unique(['organizationId', 'userId'])
@Index(['userId', 'status'])
export class OrganizationMembership extends AppBaseEntity {
  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn()
  organization?: Relation<Organization>;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user?: Relation<User>;

  @Column({ type: 'enum', enum: Role, enumName: 'membership_role' })
  role: Role;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status',
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;
}
