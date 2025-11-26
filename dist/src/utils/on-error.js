import { INTERNAL_SERVER_ERROR, OK } from "../constants/http-status-codes.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { UNIQUE_INDEX_MESSAGES } from "../constants/app-constants.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
export function getValidationErrors(issues = []) {
    const errors = {};
    for (const issue of issues) {
        const path = issue.path ?? [];
        if (path.length > 0) {
            const last = path[path.length - 1];
            const field = typeof last.key === "string" ? last.key
                : typeof last.key === "number"
                    ? String(last.key)
                    : last.type;
            errors[field] = issue.message;
        }
    }
    return errors;
}
const onError = (err, c) => {
    const currentStatus = "status" in err ? err.status : c.newResponse(null).status;
    const statusCode = currentStatus !== OK ? currentStatus : INTERNAL_SERVER_ERROR;
    return c.json({
        success: false,
        status: statusCode,
        message: err.message || "Internal server error",
        errors: err.errData,
    }, statusCode);
};
export function parseUniqueConstraintError(error) {
    if (error?.code !== "23505")
        throw error;
    const idx = error.constraint;
    const message = idx && UNIQUE_INDEX_MESSAGES[idx] ? UNIQUE_INDEX_MESSAGES[idx] : "Duplicate value exist.";
    throw new ConflictException(message);
}
export function parseDatabaseError(error) {
    const pgError = error.cause ?? error;
    if (pgError?.code === "23505") {
        return parseUniqueConstraintError(pgError);
    }
}
export function handleJsonParseError(error) {
    if (error.message?.includes("Unexpected end of JSON")) {
        throw new BadRequestException("Invalid or missing JSON body");
    }
}
export function handleForeignKeyViolationError(error) {
    const pgError = error.cause ?? error;
    if (pgError?.code === "23503") {
        const [, field, value] = pgError.detail?.match(/\((.*?)\)=\((.*?)\)/) || [];
        throw new BadRequestException(field && value ? `Invalid foreign key: ${field} '${value}' does not exist` : "Invalid foreign key value: Referenced record not found");
    }
}
export default onError;
