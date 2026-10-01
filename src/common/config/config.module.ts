import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './configuration';
import { validateEnv } from './env.validation';

const envFilePath = process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'];

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath,
      validate: (raw) => configuration(validateEnv(raw)),
    }),
  ],
})
export class AppConfigModule {}
