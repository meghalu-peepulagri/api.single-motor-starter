import type { Context, ErrorHandler } from "hono";
import type { ContentfulStatusCode, StatusCode } from "hono/utils/http-status";

import { INTERNAL_SERVER_ERROR, OK } from "../constants/http-status-codes.js";
import type { BaseIssue } from "valibot";

export function getValidationErrors(issues: BaseIssue<unknown>[] = []) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path ?? [];
    if (path.length > 0) {
      const last = path[path.length - 1];

      const field =
        typeof last.key === "string"? last.key
          : typeof last.key === "number"
          ? String(last.key)
          : last.type;
      errors[field] = issue.message;
    }
  }

  return errors;
}




const onError: ErrorHandler = (err: any, c: Context) => {
  const currentStatus = "status" in err
    ? err.status
    : c.newResponse(null).status;
  const statusCode = currentStatus !== OK
    ? (currentStatus as StatusCode)
    : INTERNAL_SERVER_ERROR;

  return c.json(
    {
      success: false,
      status: statusCode,
      message: err.message || "Internal server error",
      errors: err.errData,
    },
    statusCode as ContentfulStatusCode,
  );
};

export default onError;
