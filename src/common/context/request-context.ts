import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContextStore {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  organizationId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  get(): RequestContextStore | undefined {
    return storage.getStore();
  },
  set(values: Partial<RequestContextStore>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, values);
  },
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-request-id'];
  const requestId =
    typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('x-request-id', requestId);
  RequestContext.run(
    {
      requestId,
      ipAddress: req.ip,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent'].slice(0, 500)
          : undefined,
    },
    next,
  );
}
