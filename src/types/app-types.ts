import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ValidatedUpdateDefaultSettings } from "../validations/schema/deafult-settings.js";
import type { validatedAddField } from "../validations/schema/field-validations.js";
import type { ValidatedAddLocation } from "../validations/schema/location-validations.js";
import type { ValidatedMotorSchedule, ValidatedMotorScheduleArray } from "../validations/schema/motor-schedule-validators.js";
import type { validatedAddMotor, validatedUpdateMotor } from "../validations/schema/motor-validations.js";
import type { validatedAddStarter, validatedAssignLocationToStarter, validatedAssignStarter, validatedAssignStarterWeb, validatedReplaceStarter, validatedUpdateDeployedStatus } from "../validations/schema/starter-validations.js";
import type { ValidatedSignInEmail, ValidatedSignInPhone, ValidatedSignUpUser, ValidatedVerifyOtp } from "../validations/schema/user-validations.js";

export type ValidatedRequest = ValidatedSignUpUser | ValidatedSignInEmail | ValidatedAddLocation | ValidatedSignInPhone | ValidatedVerifyOtp | validatedAddField | validatedAddMotor | validatedUpdateMotor | validatedAddStarter | ValidatedMotorSchedule
  | ValidatedMotorScheduleArray | validatedAssignStarter | validatedReplaceStarter | validatedAssignStarterWeb | validatedUpdateDeployedStatus | validatedAssignLocationToStarter | ValidatedUpdateDefaultSettings;

export type AppActivity = "signup" | "signin-email" | "add-location" | "signin-phone" | "verify-otp" | "add-field" | "add-motor" | "update-motor" | "add-starter" | "create-motor-schedule" | "assign-starter" | "replace-starter" |
  "assign-starter-web" | "update-deployed-status" | "assign-location-to-starter" | "update-default-settings" | "update-settings-limits";

export interface IResp {
  status: ContentfulStatusCode;
  success: boolean;
  message: string;
}

export interface IRespWithData<T = unknown> extends IResp {
  data: T;
}

export interface JWTPayload {
  sub: number;
  iat: number;
}


export interface fieldInputType {
  field_name: string;
  location_id: number;
  acres?: number | undefined;
  motors?: {
    id?: number;
    name: string;
    hp: number;
  }[] | undefined;
};

export interface arrayOfMotorInputType {
  name: string;
  hp: number;
}[];

export interface starterBoxPayloadType {
  name?: string | null | undefined;
  pcb_number?: string | null | undefined;
  starter_number: string;
  mac_address?: string | null | undefined;
  gateway_id?: number | null | undefined;
}

export interface ValidationOutput {
  validated_payload: boolean;
  data: any;
  group: string | null;
  errors: string[];
  T: number | null;
  S: number | null;
  ct: string | null;
};

export interface AssignStarterType {
  pcb_number: string;
  motor_name: string;
  location_id: number;
  hp: number;
}
