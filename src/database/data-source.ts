import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { configuration } from '../common/config/configuration';
import { validateEnv } from '../common/config/env.validation';
import { buildDataSourceOptions } from './typeorm-options';

loadEnv({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

export const appConfig = configuration(validateEnv(process.env));

export default new DataSource(buildDataSourceOptions(appConfig.db));
