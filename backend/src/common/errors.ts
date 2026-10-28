export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, code = "BAD_REQUEST", details?: unknown) =>
  new AppError(400, code, msg, details);
export const unauthorized = (msg = "Authentication required", code = "UNAUTHORIZED") =>
  new AppError(401, code, msg);
export const forbidden = (msg = "Forbidden", code = "FORBIDDEN") =>
  new AppError(403, code, msg);
export const notFound = (msg = "Not found", code = "NOT_FOUND") =>
  new AppError(404, code, msg);
export const conflict = (msg: string, code = "CONFLICT", details?: unknown) =>
  new AppError(409, code, msg, details);

export function asyncHandler(
  fn: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<unknown>
) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
