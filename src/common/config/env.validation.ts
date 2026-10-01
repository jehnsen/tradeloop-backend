import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number) @IsInt() PORT = 3000;
  @IsString() CORS_ORIGINS = '*';
  @IsString() LOG_LEVEL = 'info';
  @Transform(toBool) @IsBoolean() SWAGGER_ENABLED = true;
  @Transform(toBool) @IsBoolean() TRUST_PROXY = false;

  @IsString() DB_HOST = 'localhost';
  @Type(() => Number) @IsInt() DB_PORT = 5432;
  @IsString() DB_USER = 'postgres';
  @IsString() DB_PASSWORD = 'postgres';
  @IsString() DB_NAME = 'tradeloop';
  @Transform(toBool) @IsBoolean() DB_SSL = false;
  @Transform(toBool) @IsBoolean() DB_LOGGING = false;
  @Type(() => Number) @IsInt() @Min(1) DB_POOL_SIZE = 10;

  @IsString() REDIS_HOST = 'localhost';
  @Type(() => Number) @IsInt() REDIS_PORT = 6379;
  @IsOptional() @IsString() REDIS_PASSWORD?: string;
  @Type(() => Number) @IsInt() REDIS_DB = 0;
  @IsString() QUEUE_PREFIX = 'tradeloop';

  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @Type(() => Number) @IsInt() @Min(60) JWT_ACCESS_TTL_SECONDS = 900;
  @Type(() => Number) @IsInt() @Min(1) JWT_REFRESH_TTL_DAYS = 30;

  @Type(() => Number) @IsInt() THROTTLE_TTL_MS = 60000;
  @Type(() => Number) @IsInt() THROTTLE_LIMIT = 300;
  @Type(() => Number) @IsInt() AUTH_THROTTLE_LIMIT = 10;

  @Type(() => Number) @IsInt() @Min(0) TRACKING_MIN_DISTANCE_M = 25;
  @Type(() => Number) @IsInt() @Min(0) TRACKING_MIN_INTERVAL_S = 30;
  @Type(() => Number) @IsInt() @Min(0) TRACKING_RETENTION_DAYS = 0;
  @Type(() => Number) @IsNumber() @Min(1) TRACKING_DEFAULT_SPEED_KPH = 40;
  @Type(() => Number) @IsNumber() @Min(1) TRACKING_ROAD_FACTOR = 1.3;

  @Type(() => Number) @IsNumber() MATCH_WEIGHT_ROUTE = 30;
  @Type(() => Number) @IsNumber() MATCH_WEIGHT_VEHICLE = 20;
  @Type(() => Number) @IsNumber() MATCH_WEIGHT_CAPACITY = 15;
  @Type(() => Number) @IsNumber() MATCH_WEIGHT_SCHEDULE = 15;
  @Type(() => Number) @IsNumber() MATCH_WEIGHT_PICKUP = 10;
  @Type(() => Number) @IsNumber() MATCH_WEIGHT_DROPOFF = 10;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) MATCH_MIN_SCORE = 40;
  @Type(() => Number) @IsNumber() @Min(1) MATCH_CORRIDOR_KM = 50;
  @Type(() => Number) @IsNumber() @Min(1) MATCH_PROXIMITY_RADIUS_KM = 100;
  @Type(() => Number) @IsNumber() @Min(0) MATCH_SCHEDULE_TOLERANCE_HOURS = 48;

  @IsIn(['PERCENTAGE', 'FIXED', 'NONE']) PLATFORM_COMMISSION_TYPE = 'PERCENTAGE';
  @Type(() => Number) @IsNumber() @Min(0) PLATFORM_COMMISSION_VALUE = 5;
  @IsString() DEFAULT_CURRENCY = 'PHP';

  @IsIn(['local']) STORAGE_DRIVER = 'local';
  @IsString() STORAGE_LOCAL_PATH = './storage';
  @Type(() => Number) @IsInt() @Min(1) UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return validated;
}
