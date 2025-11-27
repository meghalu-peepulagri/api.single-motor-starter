import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";

import { safeParseAsync, type BaseSchema } from "valibot";
import type { AppActivity, ValidatedRequest } from "../types/app-types.js";
import { getValidationErrors } from "../utils/on-error.js";
import { vAddLocation } from "./schema/location-validations.js";
import { vSignInEmail, vSignInPhone, vSignUp, vVerifyOtp } from "./schema/user-validations.js";

const schemaMap: Record<AppActivity, BaseSchema<any, any, any>> = {
  "signup": vSignUp,
  "signin-email": vSignInEmail,
  "add-location": vAddLocation,
  "signin-phone": vSignInPhone,
  "verify-otp": vVerifyOtp,

};

export async function validatedRequest<R extends ValidatedRequest>(
  actionType: AppActivity,
  reqData: any,
  errorMessage: string,
) {
  const schema = schemaMap[actionType];

  if (!schema) {
    throw new Error(`Schema not registered for activity: ${actionType}`);
  }

  const validation = await safeParseAsync(schema, reqData, {
    abortPipeEarly: true,
  });

  if (!validation.success) {
    throw new UnprocessableEntityException(
      errorMessage,
      getValidationErrors(validation.issues),
    );
  }

  return validation.output as R;
}
