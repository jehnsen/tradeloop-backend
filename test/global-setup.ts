import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

/** Rebuilds the test database from migrations so every run validates them on a clean schema. */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  loadEnv({ path: '.env.test', quiet: true });
  const { buildDataSourceOptions } = await import('../src/database/typeorm-options');
  const { configuration } = await import('../src/common/config/configuration');
  const { validateEnv } = await import('../src/common/config/env.validation');
  const config = configuration(validateEnv(process.env));

  const ds = new DataSource(buildDataSourceOptions(config.db));
  await ds.initialize();
  await ds.query('DROP SCHEMA IF EXISTS public CASCADE');
  await ds.query('CREATE SCHEMA public');
  await ds.runMigrations({ transaction: 'all' });
  await ds.destroy();

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    password: config.redis.password || undefined,
  });
  await redis.flushdb();
  await redis.quit();
}
