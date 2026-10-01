import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { ErrorDetail } from './app.exception';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  errors: ErrorDetail[];
}

const PG_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: 409, code: 'DUPLICATE_RESOURCE', message: 'Resource already exists' },
  '23503': {
    status: 409,
    code: 'REFERENCE_CONSTRAINT',
    message: 'Referenced resource is invalid or in use',
  },
  '23514': {
    status: 409,
    code: 'CONSTRAINT_VIOLATION',
    message: 'Operation violates a data constraint',
  },
  '22P02': { status: 400, code: 'BAD_REQUEST', message: 'Invalid input value' },
  '40001': {
    status: 409,
    code: 'CONCURRENT_MODIFICATION',
    message: 'Concurrent modification, retry the request',
  },
  '40P01': {
    status: 409,
    code: 'CONCURRENT_MODIFICATION',
    message: 'Concurrent modification, retry the request',
  },
  '55P03': {
    status: 409,
    code: 'CONCURRENT_MODIFICATION',
    message: 'Resource is locked, retry the request',
  },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        {
          err:
            exception instanceof Error
              ? { message: exception.message, stack: exception.stack }
              : exception,
        },
        'Unhandled exception',
      );
      if (this.isProduction) body.message = 'Internal server error';
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        const message = Array.isArray(r.message)
          ? r.message.join('; ')
          : String(r.message ?? exception.message);
        return {
          statusCode: status,
          code: typeof r.code === 'string' ? r.code : (STATUS_CODES[status] ?? 'ERROR'),
          message,
          errors: Array.isArray(r.errors) ? (r.errors as ErrorDetail[]) : [],
        };
      }
      return {
        statusCode: status,
        code: STATUS_CODES[status] ?? 'ERROR',
        message: String(res),
        errors: [],
      };
    }
    if (exception instanceof QueryFailedError) {
      const pgCode = (exception.driverError as { code?: string } | undefined)?.code ?? '';
      const mapped = PG_ERRORS[pgCode];
      if (mapped)
        return {
          statusCode: mapped.status,
          code: mapped.code,
          message: mapped.message,
          errors: [],
        };
    }
    if (exception instanceof EntityNotFoundError) {
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found', errors: [] };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: exception instanceof Error ? exception.message : 'Internal server error',
      errors: [],
    };
  }
}
