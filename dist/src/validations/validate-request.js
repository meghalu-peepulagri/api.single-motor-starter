import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
import { safeParseAsync } from "valibot";
import { vAddField } from "./schema/field-validations.js";
import { vAddLocation } from "./schema/location-validations.js";
import { vSignInEmail, vSignInPhone, vSignUp, vVerifyOtp } from "./schema/user-validations.js";
import { validationErrors } from "../utils/on-error.js";
import { vAddMotor } from "./schema/motor-validations.js";
const schemaMap = {
    "signup": vSignUp,
    "signin-email": vSignInEmail,
    "add-location": vAddLocation,
    "signin-phone": vSignInPhone,
    "verify-otp": vVerifyOtp,
    "add-field": vAddField,
    "add-motor": vAddMotor,
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
        throw new UnprocessableEntityException(errorMessage, validationErrors(validation.issues));
    }
    return validation.output;
}
