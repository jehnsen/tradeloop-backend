import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { configureApp } from '../src/app.setup';
import { WorkerModule } from '../src/worker.module';

process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

export const PASSWORD = 'Str0ngPassword!';

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  close(): Promise<void>;
}

/** Boots the API together with the queue processors so async flows run inside the test process. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}`, close: () => app.close() };
}

export class Client {
  constructor(
    private readonly app: INestApplication,
    public token?: string,
  ) {}

  private with(req: request.Test) {
    return this.token ? req.set('Authorization', `Bearer ${this.token}`) : req;
  }

  get(path: string) {
    return this.with(request(this.app.getHttpServer()).get(`/api/v1${path}`));
  }

  post(path: string, body?: object) {
    return this.with(request(this.app.getHttpServer()).post(`/api/v1${path}`)).send(body ?? {});
  }

  patch(path: string, body: object) {
    return this.with(request(this.app.getHttpServer()).patch(`/api/v1${path}`)).send(body);
  }

  put(path: string, body: object) {
    return this.with(request(this.app.getHttpServer()).put(`/api/v1${path}`)).send(body);
  }

  delete(path: string) {
    return this.with(request(this.app.getHttpServer()).delete(`/api/v1${path}`));
  }

  upload(
    path: string,
    fields: Record<string, string>,
    file: { buffer: Buffer; name: string; type: string },
  ) {
    let req = this.with(request(this.app.getHttpServer()).post(`/api/v1${path}`));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', file.buffer, { filename: file.name, contentType: file.type });
  }
}

export const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@test.local`;

export async function registerOrg(app: INestApplication, type: string, name: string) {
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, ''));
  const res = await new Client(app).post('/auth/register', {
    email,
    password: PASSWORD,
    firstName: 'Test',
    lastName: name,
    organization: { name, type },
  });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    client: new Client(app, res.body.data.accessToken),
    email,
    organizationId: res.body.data.organizationId as string,
    tokens: res.body.data,
  };
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const res = await new Client(app).post('/auth/login', { email, password });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return new Client(app, res.body.data.accessToken);
}

/** Polls until the predicate returns a truthy value (for queue/event driven side effects). */
export async function eventually<T>(
  fn: () => Promise<T | undefined | null | false>,
  timeoutMs = 15_000,
  intervalMs = 200,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms${last ? `: ${String(last)}` : ''}`);
}

export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d90000000049454e44ae426082',
  'hex',
);
