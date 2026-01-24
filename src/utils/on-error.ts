import type { Context, ErrorHandler } from "hono";
import type { ContentfulStatusCode, StatusCode } from "hono/utils/http-status";

import type { BaseIssue } from "valibot";
import { FOREIGN_KEY_MESSAGES, UNIQUE_INDEX_MESSAGES } from "../constants/app-constants.js";
import { INTERNAL_SERVER_ERROR, OK } from "../constants/http-status-codes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";

export function getValidationErrors(issues: BaseIssue<unknown>[] = []) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path ?? [];
    if (path.length > 0) {
      const last = path[path.length - 1];

      const field =
        typeof last.key === "string" ? last.key
          : typeof last.key === "number"
            ? String(last.key)
            : last.type;
      errors[field] = issue.message;
    }
  }

  return errors;
}

export function validationErrors(issues: BaseIssue<unknown>[] = []) {
  return issues.reduce((acc, issue) => {
    const fullPath = issue.path
      ? issue.path
        .map((p) => (p.key !== undefined ? p.key : 'index' in p ? p.index : ''))
        .filter(Boolean)
        .join('.')
      : '';

    const key = fullPath || 'phone';
    acc[key] = issue.message;
    return acc;
  }, {} as Record<string, string>);
}




const onError: ErrorHandler = (err: Error & { status?: number; errData?: unknown }, c: Context) => {
  const currentStatus = "status" in err ? err.status : c.newResponse(null).status;
  const statusCode = currentStatus !== OK ? (currentStatus as StatusCode) : INTERNAL_SERVER_ERROR;

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



export function parseUniqueConstraintError(error: Error & { code?: string; constraint?: string }) {
  if (error?.code !== "23505") throw error;

  const idx = error.constraint;
  const message = idx && UNIQUE_INDEX_MESSAGES[idx] ? UNIQUE_INDEX_MESSAGES[idx] : "Duplicate value exist.";
  throw new ConflictException(message)
}

export function parseDatabaseError(error: Error & { cause?: Error & { code?: string; constraint?: string } }) {
  const pgError = error.cause ?? error;
  if ('code' in pgError && pgError?.code === "23505") {
    return parseUniqueConstraintError(pgError);
  }
}

export function handleJsonParseError(error: Error) {
  if (error.message?.includes("Unexpected end of JSON")) {
    throw new BadRequestException("Invalid or missing JSON body");
  }
}

export function handleForeignKeyViolationError(error: Error & { cause?: Error & { code?: string; constraint?: string; detail?: string } }) {
  const pgError = error.cause ?? error;

  if ('code' in pgError && pgError?.code === "23503") {
    const constraint = 'constraint' in pgError ? pgError.constraint ?? "" : "";
    const mappedMessage = FOREIGN_KEY_MESSAGES[constraint];
    const detail = 'detail' in pgError ? pgError.detail : undefined;
    const [, field, value] = detail?.match(/\((.*?)\)=\((.*?)\)/) || [];
    const message = mappedMessage ? mappedMessage : field && value ? `Invalid foreign key: ${field} '${value}' does not exist.` : "Invalid foreign key value: Referenced record not found.";
    throw new BadRequestException(message);
  }

  throw error;
}


export default onError;
