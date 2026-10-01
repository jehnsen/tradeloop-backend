import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SessionRevokeReason {
  ROTATED = 'ROTATED',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  REUSE_DETECTED = 'REUSE_DETECTED',
  SWITCHED_ORGANIZATION = 'SWITCHED_ORGANIZATION',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  EXPIRED = 'EXPIRED',
  ADMIN = 'ADMIN',
}

/** One row per issued refresh token. Rotated tokens share a familyId (one login/device session). */
@Entity('refresh_sessions')
@Index(['userId', 'revokedAt'])
@Index(['familyId'])
@Index(['expiresAt'])
export class RefreshSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user?: Relation<User>;

  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column('uuid')
  familyId: string;

  @Column({ length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    type: 'enum',
    enum: SessionRevokeReason,
    enumName: 'session_revoke_reason',
    nullable: true,
  })
  revokedReason: SessionRevokeReason | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
