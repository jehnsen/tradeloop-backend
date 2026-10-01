import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AppConfig } from '../common/config/configuration';
import { ENTITIES } from './entities';

export function buildDataSourceOptions(db: AppConfig['db']): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'schema_migrations',
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    uuidExtension: 'pgcrypto',
    logging: db.logging ? ['query', 'error'] : ['error'],
    poolSize: db.poolSize,
    extra: { options: '-c timezone=UTC', max: db.poolSize },
  };
}
