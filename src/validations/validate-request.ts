import BadRequestException from "../exceptions/bad-request-exception.js";
import { safeParseAsync, type BaseSchema } from "valibot";
import type { AppActivity, ValidatedRequest } from "../types/app-types.js";
import { validationErrors } from "../utils/on-error.js";
import { vAddField } from "./schema/field-validations.js";
import { vAddLocation } from "./schema/location-validations.js";
import { vAddMotorSchedule, vAddRepeatDays, vArrayOfMotorScheduleValidators, vUpdateMotorSchedule } from "./schema/motor-schedule-validators.js";
import { vAddMotor, vUpdateMotor, vUpdateMotorTestRunStatus } from "./schema/motor-validations.js";
import { vAddStarter, vAssignLocationToStarter, vAssignStarter, vAssignStarterWeb, vReplaceStarter, vUpdateDeployedStatus, vUpdateInstalledLocation } from "./schema/starter-validations.js";
import { vSignInEmail, vSignInPhone, vSignUp, vVerifyOtp } from "./schema/user-validations.js";
import { vUpdateDefaultSettings } from "./schema/default-settings.js";
import { vUpdateDefaultSettingsLimits } from "./schema/default-settings-limits.js";
import { vAddStarterDispatch } from "./schema/starter-dispatch-validations.js";
import { vAddGateway, vAssignGatewayToUser, vRenameGateway, vUpdateGatewayLabel, vUpdateGatewayNumber } from "./schema/gateway-validations.js";
import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";

const schemaMap: Record<AppActivity, BaseSchema<any, any, any>> = {
  "signup": vSignUp,
  "signin-email": vSignInEmail,
  "add-location": vAddLocation,
  "signin-phone": vSignInPhone,
  "verify-otp": vVerifyOtp,
  "add-field": vAddField,
  "add-motor": vAddMotor,
  "update-motor": vUpdateMotor,
  "update-motor-test-run-status": vUpdateMotorTestRunStatus,
  "add-starter": vAddStarter,
  "create-motor-schedule": vAddMotorSchedule,
  "create-bulk-motor-schedule": vArrayOfMotorScheduleValidators,
  "update-motor-schedule": vUpdateMotorSchedule,
  "add-repeat-days": vAddRepeatDays,
  "assign-starter": vAssignStarter,
  "replace-starter": vReplaceStarter,
  "assign-starter-web": vAssignStarterWeb,
  "update-deployed-status": vUpdateDeployedStatus,
  "assign-location-to-starter": vAssignLocationToStarter,
  "update-default-settings": vUpdateDefaultSettings,
  "update-default-settings-limits": vUpdateDefaultSettingsLimits,
  "add-starter-dispatch": vAddStarterDispatch,
  "update-starter-dispatch": vAddStarterDispatch,
  "add-gateway": vAddGateway,
  "update-gateway-label": vUpdateGatewayLabel,
  "rename-gateway": vRenameGateway,
  "assign-gateway": vAssignGatewayToUser,
  "update-gateway-number": vUpdateGatewayNumber,
  "update-installed-location": vUpdateInstalledLocation,
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
    const fieldErrors = validation.issues.filter((issue) => issue.path && issue.path.length > 0);
    const crossFieldErrors = validation.issues.filter((issue) => !issue.path || issue.path.length === 0);

    if (fieldErrors.length > 0) {
      throw new UnprocessableEntityException(
        errorMessage,
        validationErrors(fieldErrors),
      );
    }

    if (crossFieldErrors.length > 0) {
      throw new BadRequestException(
        crossFieldErrors[0].message,
      );
    }
  }

  return validation.output as R;
}
