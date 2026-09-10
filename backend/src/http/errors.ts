import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  static badRequest(message: string, details?: unknown) { return new ApiError(400, "BAD_REQUEST", message, details); }
  static unauthorized(message = "Authentication required") { return new ApiError(401, "UNAUTHORIZED", message); }
  static forbidden(message = "Insufficient permission") { return new ApiError(403, "FORBIDDEN", message); }
  static notFound(message = "Resource not found") { return new ApiError(404, "NOT_FOUND", message); }
  static conflict(code: string, message: string, details?: unknown) { return new ApiError(409, code, message, details); }
  static unprocessable(message: string, details?: unknown) { return new ApiError(422, "VALIDATION_ERROR", message, details); }
  static unavailable(message = "Dependency unavailable") { return new ApiError(503, "SERVICE_UNAVAILABLE", message); }
  static upstream(message = "Blockchain provider unavailable") { return new ApiError(502, "UPSTREAM_FAILURE", message); }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const candidate = error as { status?: number; code?: string; message?: string; name?: string };
  const apiError = error instanceof ApiError
    ? error
    : error instanceof SyntaxError
      ? ApiError.badRequest("Malformed JSON")
      : candidate.code === "P1001" || candidate.name === "PrismaClientInitializationError"
        ? ApiError.unavailable("Database unavailable")
      : candidate.status && candidate.code
        ? new ApiError(candidate.status, candidate.code, candidate.message ?? "Request failed")
        : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  if (res.headersSent) return;
  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
      requestId: req.id,
    },
  });
}
