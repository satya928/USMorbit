export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED";

const HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return HTTP_STATUS[this.code];
  }
}

export const forbidden = (msg = "You do not have permission to perform this action.") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Record") => new AppError("NOT_FOUND", `${what} not found.`);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", msg, fieldErrors);

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: AppErrorCode; fieldErrors?: Record<string, string> };

/** Convert thrown errors into a safe, serialisable result. Unknown errors never leak details. */
export function toActionError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
  console.error("[orbit] unexpected error", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}
