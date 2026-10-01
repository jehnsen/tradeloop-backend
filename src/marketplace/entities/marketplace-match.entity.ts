import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/entities/base.entity';
import { NumericColumn } from '../../common/entities/columns';
import { AvailableLoadPosting } from './load-posting.entity';
import { AvailableVehiclePosting } from './vehicle-posting.entity';

@Entity('marketplace_matches')
@Unique(['loadPostingId', 'vehiclePostingId'])
@Index(['vehiclePostingId', 'score'])
export class MarketplaceMatch extends AppBaseEntity {
  @Column('uuid')
  loadPostingId: string;

  @ManyToOne(() => AvailableLoadPosting, { onDelete: 'CASCADE' })
  @JoinColumn()
  loadPosting?: Relation<AvailableLoadPosting>;

  @Column('uuid')
  vehiclePostingId: string;

  @ManyToOne(() => AvailableVehiclePosting, { onDelete: 'CASCADE' })
  @JoinColumn()
  vehiclePosting?: Relation<AvailableVehiclePosting>;

  @Column('smallint')
  score: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  reasons: string[];

  @NumericColumn({ precision: 10, scale: 2 })
  pickupDetourKm: number;

  @NumericColumn({ precision: 10, scale: 2 })
  dropoffDetourKm: number;
}
