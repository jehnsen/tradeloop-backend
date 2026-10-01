import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../users/entities/user.entity';

export enum DocumentEntityType {
  ORDER = 'ORDER',
  SHIPMENT = 'SHIPMENT',
  LOAD = 'LOAD',
  TRIP = 'TRIP',
  VEHICLE = 'VEHICLE',
  DRIVER = 'DRIVER',
  BOOKING = 'BOOKING',
}

export enum DocumentType {
  PROOF_OF_DELIVERY = 'PROOF_OF_DELIVERY',
  DELIVERY_RECEIPT = 'DELIVERY_RECEIPT',
  INVOICE = 'INVOICE',
  VEHICLE_DOCUMENT = 'VEHICLE_DOCUMENT',
  DRIVER_DOCUMENT = 'DRIVER_DOCUMENT',
  SHIPMENT_ATTACHMENT = 'SHIPMENT_ATTACHMENT',
  OTHER = 'OTHER',
}

@Entity('documents')
@Index(['organizationId', 'entityType', 'entityId'])
@Index(['entityType', 'entityId'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn()
  organization?: Relation<Organization>;

  @Column({ type: 'enum', enum: DocumentEntityType, enumName: 'document_entity_type' })
  entityType: DocumentEntityType;

  @Column('uuid')
  entityId: string;

  @Column({ type: 'enum', enum: DocumentType, enumName: 'document_type' })
  type: DocumentType;

  @Column({ length: 255 })
  fileName: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column('int')
  size: number;

  @Column({ length: 500, select: false })
  storageKey: string;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader?: Relation<User>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
