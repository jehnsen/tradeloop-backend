import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('number_sequences')
export class NumberSequence {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  scope: string;

  @PrimaryColumn({ type: 'varchar', length: 8 })
  prefix: string;

  @PrimaryColumn({ type: 'int' })
  year: number;

  @Column({ type: 'bigint', default: 0 })
  value: string;
}
