import BadRequestException from "../exceptions/bad-request-exception.js";

import { safeParseAsync, type BaseSchema } from "valibot";
import type { AppActivity, ValidatedRequest } from "../types/app-types.js";
import { validationErrors } from "../utils/on-error.js";
import { vAddField } from "./schema/field-validations.js";
import { vAddLocation } from "./schema/location-validations.js";
import { vAddMotorSchedule } from "./schema/motor-schedule-validators.js";
import { vAddMotor, vUpdateMotor } from "./schema/motor-validations.js";
import { vAddStarter, vAssignLocationToStarter, vAssignStarter, vAssignStarterWeb, vReplaceStarter, vUpdateDeployedStatus } from "./schema/starter-validations.js";
import { vSignInEmail, vSignInPhone, vSignUp, vVerifyOtp } from "./schema/user-validations.js";
import { vUpdateDefaultSettings } from "./schema/default-settings.js";

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
  "assign-starter": vAssignStarter,
  "replace-starter": vReplaceStarter,
  "assign-starter-web": vAssignStarterWeb,
  "update-deployed-status": vUpdateDeployedStatus,
  "assign-location-to-starter": vAssignLocationToStarter,
  "update-default-settings": vUpdateDefaultSettings,
  "update-settings-limits": vUpdateDefaultSettings
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
    throw new BadRequestException(
      errorMessage,
      validationErrors(validation.issues),
    );
  }

  return validation.output as R;
}