/** A business rule rejected an ops command. Mapped to an HTTP error by the ops service. */
export class OpsCommandError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundError = (what: string, id: string) =>
  new OpsCommandError(404, 'NOT_FOUND', `${what} ${id} not found`);

export const ruleError = (code: string, message: string) => new OpsCommandError(409, code, message);

export const forbiddenError = (message: string) => new OpsCommandError(403, 'FORBIDDEN', message);
