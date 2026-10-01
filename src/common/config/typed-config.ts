import { ConfigService } from '@nestjs/config';
import { AppConfig } from './configuration';

export type TypedConfigService = ConfigService<AppConfig, true>;

export function getConfig<K extends keyof AppConfig>(
  config: TypedConfigService,
  key: K,
): AppConfig[K] {
  return config.get(key, { infer: true });
}
