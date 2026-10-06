import { INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './common/config/configuration';
import { requestContextMiddleware } from './common/context/request-context';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { ResponseInterceptor } from './common/http/response.interceptor';
import { createValidationPipe } from './common/http/validation.pipe';
import { RedisIoAdapter } from './common/realtime/redis-io.adapter';

export const API_PREFIX = 'api/v1';

const API_DESCRIPTION = `
Multi-tenant logistics operations and trucking marketplace API.

**Auth**: \`POST /auth/login\` returns a short-lived bearer access token and a rotating refresh token.
The active organization is bound to the token; switch with \`POST /auth/switch-organization\`.

**Envelope**: success \`{ "data": ..., "meta": {...} }\`; errors
\`{ "statusCode": 400, "code": "VALIDATION_ERROR", "message": "...", "errors": [{ "field": "...", "messages": [] }] }\`.

**Pagination**: \`page\` (default 1), \`limit\` (default 20, max 100), \`sort\` (endpoint-specific), \`order\` (ASC|DESC).
List responses include \`meta.page/limit/total/totalPages\`.

**Realtime**: Socket.IO namespace \`/realtime\`, auth via \`{ auth: { token } }\`. Emit \`trip.subscribe { tripId }\`.
Events: \`vehicle.location.updated\`, \`trip.status.updated\`, \`trip.eta.updated\`, \`notification.created\`.
`;

/** Shared HTTP setup for the API process and e2e tests. */
export async function configureApp(app: INestApplication): Promise<void> {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const express = app as NestExpressApplication;

  app.useLogger(app.get(Logger));
  express.set('trust proxy', config.get('trustProxy', { infer: true }) ? 1 : false);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '1mb' });
  app.use(requestContextMiddleware);
  app.use(helmet());
  // The ops snapshot is a few MB of JSON; it compresses about tenfold.
  app.use(compression());
  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(config.get('isProduction', { infer: true })));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();

  const ioAdapter = new RedisIoAdapter(
    app,
    config.get('redis', { infer: true }),
    config.get('corsOrigins', { infer: true }),
  );
  ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  if (config.get('swaggerEnabled', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Tradeloop API')
        .setDescription(API_DESCRIPTION)
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }
}
