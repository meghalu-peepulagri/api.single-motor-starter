import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
import { safeParseAsync } from "valibot";
import { getValidationErrors } from "../utils/on-error.js";
import { vSignInEmail, vSignUp } from "./schema/user-validations.js";
const schemaMap = {
    "signup": vSignUp,
    "signin-email": vSignInEmail,
};
export async function validatedRequest(actionType, reqData, errorMessage) {
    const schema = schemaMap[actionType];
    if (!schema) {
        throw new Error(`Schema not registered for activity: ${actionType}`);
    }
    const validation = await safeParseAsync(schema, reqData, {
        abortPipeEarly: true,
    });
    if (!validation.success) {
        throw new UnprocessableEntityException(errorMessage, getValidationErrors(validation.issues));
    }
    return validation.output;
}
