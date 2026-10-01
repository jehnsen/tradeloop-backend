import { Global, Injectable, Module } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export type SequencePrefix = 'ORD' | 'SHP' | 'TRP' | 'BKG';

@Injectable()
export class SequenceService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Atomically increments a per-scope/per-year counter. Safe under concurrency because the
   * upsert takes a row lock; inside a transaction the lock is held until commit.
   */
  async next(prefix: SequencePrefix, scope: string, manager?: EntityManager): Promise<string> {
    const year = new Date().getUTCFullYear();
    const rows: Array<{ value: string }> = await (manager ?? this.dataSource.manager).query(
      `INSERT INTO number_sequences (scope, prefix, year, value) VALUES ($1, $2, $3, 1)
       ON CONFLICT (scope, prefix, year) DO UPDATE SET value = number_sequences.value + 1
       RETURNING value`,
      [scope, prefix, year],
    );
    return `${prefix}-${year}-${String(rows[0].value).padStart(6, '0')}`;
  }
}

@Global()
@Module({ providers: [SequenceService], exports: [SequenceService] })
export class SequenceModule {}
