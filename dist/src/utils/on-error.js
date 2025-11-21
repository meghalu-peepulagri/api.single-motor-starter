import { INTERNAL_SERVER_ERROR, OK } from "../constants/http-status-codes.js";
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
    const currentStatus = "status" in err
        ? err.status
        : c.newResponse(null).status;
    const statusCode = currentStatus !== OK
        ? currentStatus
        : INTERNAL_SERVER_ERROR;
    return c.json({
        success: false,
        status: statusCode,
        message: err.message || "Internal server error",
        errors: err.errData,
    }, statusCode);
};
export default onError;
