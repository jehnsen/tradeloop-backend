import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { emptyOpsData, OPS_COLLECTIONS } from '../domain/lib/ops-data';
import type {
  CollectionChange,
  Driver,
  OpsChanges,
  OpsCollection,
  OpsData,
  TenantProfile,
  Truck,
} from '../domain/types';
import { assignSortKeys, renumber } from './sort-keys';
import { FLEET_TABLES, OPS_TABLES, SQL_TYPE, type TableSpec } from './tables';

/** Sort keys of every stored record, per collection. */
export type SortKeys = Record<OpsCollection, Map<string, number>>;

/** One organization's operations data as stored. */
export interface TenantState {
  version: number;
  tick: number;
  profile: TenantProfile;
  data: OpsData;
  keys: SortKeys;
}

export interface TenantRow {
  version: number;
  tick: number;
}

/** The profile column holds everything except the fleet, which lives in its own tables. */
type StoredProfile = Omit<TenantProfile, 'trucks' | 'drivers'>;
type Row = { id: string };

const CHUNK = 500;
const chunks = <T>(xs: T[]) =>
  Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) =>
    xs.slice(i * CHUNK, (i + 1) * CHUNK),
  );
const q = (name: string) => `"${name}"`;

/** Reads and writes the `ops` schema. Callers own the transaction. */
@Injectable()
export class OpsStore {
  async readTenant(
    m: EntityManager,
    organizationId: string,
    lock = false,
  ): Promise<TenantRow | null> {
    const rows: { version: string; clock_tick: number }[] = await m.query(
      `SELECT version, clock_tick FROM ops.tenants WHERE organization_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [organizationId],
    );
    return rows[0] ? { version: Number(rows[0].version), tick: rows[0].clock_tick } : null;
  }

  async createTenant(m: EntityManager, organizationId: string, profile: TenantProfile) {
    const { trucks, drivers, ...stored } = profile;
    const inserted: unknown[] = await m.query(
      `INSERT INTO ops.tenants (organization_id, profile) VALUES ($1, $2)
       ON CONFLICT (organization_id) DO NOTHING RETURNING organization_id`,
      [organizationId, stored satisfies StoredProfile],
    );
    if (!inserted.length) return;
    await this.insertRows(m, organizationId, FLEET_TABLES.trucks, [], trucks);
    await this.insertRows(m, organizationId, FLEET_TABLES.drivers, [], drivers);
  }

  async load(m: EntityManager, organizationId: string): Promise<TenantState> {
    const [tenant] = await m.query(
      `SELECT version, clock_tick, profile FROM ops.tenants WHERE organization_id = $1`,
      [organizationId],
    );
    const trucks = await this.selectRows<Truck>(m, organizationId, FLEET_TABLES.trucks);
    const drivers = await this.selectRows<Driver>(m, organizationId, FLEET_TABLES.drivers);
    const data = emptyOpsData() as unknown as Record<OpsCollection, Row[]>;
    const keys = {} as SortKeys;
    for (const c of OPS_COLLECTIONS) {
      const rows = await this.selectRows<Row>(m, organizationId, OPS_TABLES[c].table);
      data[c] = rows.map((r) => r.data);
      keys[c] = new Map(rows.map((r) => [r.data.id, r.sortKey]));
    }
    return {
      version: Number(tenant.version),
      tick: tenant.clock_tick,
      profile: {
        ...(tenant.profile as StoredProfile),
        trucks: trucks.map((r) => r.data),
        drivers: drivers.map((r) => r.data),
      },
      data: data as unknown as OpsData,
      keys,
    };
  }

  /** Write one command's changes. Returns the updated sort keys. */
  async persist(
    m: EntityManager,
    organizationId: string,
    changes: OpsChanges,
    keys: SortKeys,
  ): Promise<SortKeys> {
    const next = { ...keys };
    for (const c of OPS_COLLECTIONS) {
      const change = changes[c] as CollectionChange<Row> | undefined;
      if (!change) continue;
      const spec = OPS_TABLES[c] as TableSpec<Row>;
      const current = new Map(keys[c]);
      for (const id of change.remove) current.delete(id);
      const moved = change.order
        ? assignSortKeys(change.order, current)
        : new Map<string, number>();
      for (const [id, k] of moved) current.set(id, k);
      let last = Math.max(0, ...current.values());
      for (const r of change.upsert) if (!current.has(r.id)) current.set(r.id, (last += 1024));
      next[c] = current;

      if (change.remove.length)
        await m.query(
          `DELETE FROM ops.${q(spec.table)} WHERE organization_id = $1 AND id = ANY($2)`,
          [organizationId, change.remove],
        );
      await this.upsertRows(m, organizationId, spec, change.upsert, current);
      const upserted = new Set(change.upsert.map((r) => r.id));
      const keyOnly = [...moved].filter(([id]) => !upserted.has(id));
      for (const part of chunks(keyOnly))
        await m.query(
          `UPDATE ops.${q(spec.table)} AS t SET sort_key = x.sort_key, updated_at = now()
             FROM jsonb_to_recordset($2::jsonb) AS x(id text, sort_key float8)
            WHERE t.organization_id = $1 AND t.id = x.id`,
          [
            organizationId,
            JSON.stringify(part.map(([id, sortKey]) => ({ id, sort_key: sortKey }))),
          ],
        );
    }
    return next;
  }

  async saveTenant(m: EntityManager, organizationId: string, version: number, tick: number) {
    await m.query(
      `UPDATE ops.tenants SET version = $2, clock_tick = $3, updated_at = now() WHERE organization_id = $1`,
      [organizationId, version, tick],
    );
  }

  /** Replace an organization's whole data set and profile (seed / demo reset). */
  async replaceAll(
    m: EntityManager,
    organizationId: string,
    profile: TenantProfile,
    data: OpsData,
    version: number,
  ): Promise<TenantState> {
    await m.query(`DELETE FROM ops.tenants WHERE organization_id = $1`, [organizationId]);
    await this.createTenant(m, organizationId, profile);
    const keys = {} as SortKeys;
    for (const c of OPS_COLLECTIONS) {
      const rows = data[c] as Row[];
      keys[c] = renumber(rows.map((r) => r.id));
      await this.upsertRows(m, organizationId, OPS_TABLES[c] as TableSpec<Row>, rows, keys[c]);
    }
    await this.saveTenant(m, organizationId, version, 0);
    return { version, tick: 0, profile, data, keys };
  }

  private async selectRows<T>(m: EntityManager, organizationId: string, table: string) {
    const rows: { data: T; sort_key: number }[] = await m.query(
      `SELECT data, sort_key FROM ops.${q(table)} WHERE organization_id = $1 ORDER BY sort_key`,
      [organizationId],
    );
    return rows.map((r) => ({ data: r.data, sortKey: Number(r.sort_key) }));
  }

  private insertRows(
    m: EntityManager,
    organizationId: string,
    table: string,
    columns: TableSpec<Row>['columns'],
    rows: Row[],
  ) {
    return this.upsertRows(
      m,
      organizationId,
      { table, columns },
      rows,
      renumber(rows.map((r) => r.id)),
    );
  }

  private async upsertRows(
    m: EntityManager,
    organizationId: string,
    spec: TableSpec<Row>,
    rows: Row[],
    keys: Map<string, number>,
  ) {
    if (!rows.length) return;
    const cols = spec.columns;
    const names = ['id', 'data', 'sort_key', ...cols.map((c) => c.name)];
    const types = ['text', 'jsonb', 'float8', ...cols.map((c) => SQL_TYPE[c.type])];
    const sql =
      `INSERT INTO ops.${q(spec.table)} (organization_id, ${names.map(q).join(', ')})
       SELECT $1, ${names.map((n) => `x.${q(n)}`).join(', ')}
         FROM jsonb_to_recordset($2::jsonb) AS x(${names.map((n, i) => `${q(n)} ${types[i]}`).join(', ')})
       ON CONFLICT (organization_id, id) DO UPDATE SET ` +
      [...names.slice(1).map((n) => `${q(n)} = EXCLUDED.${q(n)}`), 'updated_at = now()'].join(', ');
    for (const part of chunks(rows)) {
      const payload = part.map((r) => {
        const out: Record<string, unknown> = { id: r.id, data: r, sort_key: keys.get(r.id) };
        for (const c of cols) out[c.name] = c.value(r) ?? null;
        return out;
      });
      await m.query(sql, [organizationId, JSON.stringify(payload)]);
    }
  }
}
