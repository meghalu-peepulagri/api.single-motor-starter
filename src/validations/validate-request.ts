import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";

import { safeParseAsync, type BaseSchema } from "valibot";
import type { AppActivity, ValidatedRequest } from "../types/app-types.js";
import { vAddField } from "./schema/field-validations.js";
import { vAddLocation } from "./schema/location-validations.js";
import { vSignInEmail, vSignInPhone, vSignUp, vVerifyOtp } from "./schema/user-validations.js";
import { validationErrors } from "../utils/on-error.js";
import { vAddMotor, vUpdateMotor } from "./schema/motor-validations.js";
import { vAddStarter, vAssignStarter } from "./schema/starter-validations.js";
import { vAddMotorSchedule } from "./schema/motor-schedule-validators.js";

const schemaMap: Record<AppActivity, BaseSchema<any, any, any>> = {
  "signup": vSignUp,
  "signin-email": vSignInEmail,
  "add-location": vAddLocation,
  "signin-phone": vSignInPhone,
  "verify-otp": vVerifyOtp,
  "add-field": vAddField,
  "add-motor": vAddMotor,
  "update-motor": vUpdateMotor,
  "add-starter": vAddStarter,
  "create-motor-schedule": vAddMotorSchedule,
  "assign-starter": vAssignStarter
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
      validationErrors(validation.issues),
    );
  }

  return validation.output as R;
}

