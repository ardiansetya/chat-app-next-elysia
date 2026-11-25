export type ErrorCode =
  | "UNAUTHORIZED"
  | "NOT_MEMBER"
  | "NOT_OWNER"
  | "NOT_FOUND"
  | "CANNOT_REMOVE_OWNER"
  | "INVITE_EXPIRED"
  | "RATE_LIMITED"
  | "VALIDATION"
  | "INTERNAL";

/** Format error API seragam: { error: { code, message } } */
export const apiError = <C extends ErrorCode>(code: C, message: string) => ({ error: { code, message } });
