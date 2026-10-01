import { EnvironmentVariables, NodeEnv } from './env.validation';

export const configuration = (env: EnvironmentVariables) => ({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === NodeEnv.Production,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  logLevel: env.LOG_LEVEL,
  swaggerEnabled: env.SWAGGER_ENABLED,
  trustProxy: env.TRUST_PROXY,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
    logging: env.DB_LOGGING,
    poolSize: env.DB_POOL_SIZE,
  },
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },
  queuePrefix: env.QUEUE_PREFIX,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
  },
  throttle: {
    ttlMs: env.THROTTLE_TTL_MS,
    limit: env.THROTTLE_LIMIT,
    authLimit: env.AUTH_THROTTLE_LIMIT,
  },
  tracking: {
    minDistanceMeters: env.TRACKING_MIN_DISTANCE_M,
    minIntervalSeconds: env.TRACKING_MIN_INTERVAL_S,
    retentionDays: env.TRACKING_RETENTION_DAYS,
    defaultSpeedKph: env.TRACKING_DEFAULT_SPEED_KPH,
    roadFactor: env.TRACKING_ROAD_FACTOR,
  },
  matching: {
    weights: {
      route: env.MATCH_WEIGHT_ROUTE,
      vehicle: env.MATCH_WEIGHT_VEHICLE,
      capacity: env.MATCH_WEIGHT_CAPACITY,
      schedule: env.MATCH_WEIGHT_SCHEDULE,
      pickup: env.MATCH_WEIGHT_PICKUP,
      dropoff: env.MATCH_WEIGHT_DROPOFF,
    },
    minScore: env.MATCH_MIN_SCORE,
    corridorKm: env.MATCH_CORRIDOR_KM,
    proximityRadiusKm: env.MATCH_PROXIMITY_RADIUS_KM,
    scheduleToleranceHours: env.MATCH_SCHEDULE_TOLERANCE_HOURS,
  },
  billing: {
    commissionType: env.PLATFORM_COMMISSION_TYPE as 'PERCENTAGE' | 'FIXED' | 'NONE',
    commissionValue: env.PLATFORM_COMMISSION_VALUE,
    defaultCurrency: env.DEFAULT_CURRENCY,
  },
  storage: {
    driver: env.STORAGE_DRIVER,
    localPath: env.STORAGE_LOCAL_PATH,
    maxUploadBytes: env.UPLOAD_MAX_BYTES,
  },
});

export type AppConfig = ReturnType<typeof configuration>;
export type MatchingConfig = AppConfig['matching'];
