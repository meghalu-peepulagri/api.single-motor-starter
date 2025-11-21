import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
import { safeParseAsync } from "valibot";
import { getValidationErrors } from "../utils/on-error.js";
import { vAddUserValidator } from "./schema/user-validations.js";
const schemaMap = {
    "signup": vAddUserValidator,
};
export async function validatedRequest(actionType, reqData, errorMessage) {
    const schema = schemaMap[actionType];
    if (!schema) {
        throw new Error(`Schema not registered for activity: ${actionType}`);
    }
    const validation = await safeParseAsync(schema, reqData);
    if (!validation.success) {
        throw new UnprocessableEntityException(errorMessage, getValidationErrors(validation.issues));
    }
    return validation.output;
}
