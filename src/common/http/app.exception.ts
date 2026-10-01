import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorDetail {
  field?: string;
  messages: string[];
}

export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly errors: ErrorDetail[] = [],
  ) {
    super({ statusCode: status, code, message, errors }, status);
  }
}

export const notFound = (entity: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} not found`);

export const conflict = (code: string, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);

export const badRequest = (code: string, message: string) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message);

export const forbidden = (code: string, message: string) =>
  new AppException(HttpStatus.FORBIDDEN, code, message);

export const unauthorized = (code: string, message: string) =>
  new AppException(HttpStatus.UNAUTHORIZED, code, message);

export const unprocessable = (code: string, message: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);

export const invalidTransition = (entity: string, from: string, action: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVALID_STATE_TRANSITION',
    `Cannot ${action} ${entity} in status ${from}`,
  );
