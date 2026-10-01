import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './common/config/configuration';

process.env.TZ = 'UTC';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  await configureApp(app);
  await app.listen(
    app.get<ConfigService<AppConfig, true>>(ConfigService).get('port', { infer: true }),
    '0.0.0.0',
  );
}

void bootstrap();
