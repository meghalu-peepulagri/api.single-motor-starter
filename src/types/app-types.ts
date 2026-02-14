import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ValidatedUpdateDefaultSettingsLimits } from "../validations/schema/default-settings-limits.js";
import type { ValidatedUpdateDefaultSettings } from "../validations/schema/default-settings.js";
import type { validatedAddField } from "../validations/schema/field-validations.js";
import type { ValidatedAddLocation } from "../validations/schema/location-validations.js";
import type { ValidatedMotorSchedule, ValidatedMotorScheduleArray } from "../validations/schema/motor-schedule-validators.js";
import type { validatedAddMotor, validatedUpdateMotor, validatedUpdateMotorTestRunStatus } from "../validations/schema/motor-validations.js";
import type { validatedAddStarter, validatedAssignLocationToStarter, validatedAssignStarter, validatedAssignStarterWeb, validatedReplaceStarter, validatedUpdateDeployedStatus } from "../validations/schema/starter-validations.js";
import type { ValidatedSignInEmail, ValidatedSignInPhone, ValidatedSignUpUser, ValidatedVerifyOtp } from "../validations/schema/user-validations.js";

export type ValidatedRequest = ValidatedSignUpUser | ValidatedSignInEmail | ValidatedAddLocation | ValidatedSignInPhone | ValidatedVerifyOtp | validatedAddField | validatedAddMotor | validatedUpdateMotor | validatedUpdateMotorTestRunStatus | validatedAddStarter | ValidatedMotorSchedule
  | ValidatedMotorScheduleArray | validatedAssignStarter | validatedReplaceStarter | validatedAssignStarterWeb | validatedUpdateDeployedStatus | validatedAssignLocationToStarter | ValidatedUpdateDefaultSettings | ValidatedUpdateDefaultSettingsLimits;

export type AppActivity = "signup" | "signin-email" | "add-location" | "signin-phone" | "verify-otp" | "add-field" | "add-motor" | "update-motor" | "update-motor-test-run-status" | "add-starter" | "create-motor-schedule" | "assign-starter" | "replace-starter" |
  "assign-starter-web" | "update-deployed-status" | "assign-location-to-starter" | "update-default-settings" | "update-default-settings-limits";

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
  data: Record<string, unknown>;
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

export interface RetryOptions {
  attempts: number;
  delaysBeforeSendMs: number[]; // delays before each attempt
  ackTimeoutsMs: number[];      // time to wait for ACK per attempt
}

// =================== MQTT MESSAGE TYPES ===================
export interface MQTTMessage {
  T: number;  // Type
  S: number;  // Sequence
  [key: string]: unknown;
}

export interface MQTTLiveDataMessage extends MQTTMessage {
  M: number;  // Motor number
  VR: number; // Voltage R
  VY: number; // Voltage Y
  VB: number; // Voltage B
  CR: number; // Current R
  CY: number; // Current Y
  CB: number; // Current B
  F: number;  // Fault
  ct: string; // Created time
}

export interface MQTTControlMessage extends MQTTMessage {
  M: number;  // Motor number
  C: number;  // Command (0=OFF, 1=ON)
}

export interface MQTTAckMessage extends MQTTMessage {
  D: number;  // Data/Status
}

export interface MQTTSettingsMessage extends MQTTMessage {
  [key: string]: unknown; // Settings payload
}

// =================== OTP TYPES ===================
export interface OTPData {
  phone: string;
  otp: string;
  expires_at: Date;
  purpose: 'REGISTERED' | 'SIGN_IN_WITH_OTP' | 'PASSWORD_RESET';
}

export interface OTPQueryData {
  phone?: string;
  otp?: string;
  purpose?: string;
}

// =================== ERROR TYPES ===================
export interface DatabaseError extends Error {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ZodIssue {
  path: (string | number)[];
  message: string;
  code: string;
  [key: string]: unknown;
}

// =================== QUERY DATA TYPES ===================
export interface StarterQueryData {
  device_status?: string;
  user_id?: number;
  location_id?: number;
  status?: string;
  search?: string;
}

export interface MotorQueryData {
  location_id?: number;
  user_id?: number;
  state?: string;
  mode?: string;
  status?: string;
  search?: string;
}

// =================== PREPARED DATA TYPES ===================
export interface PreparedStarterData {
  name?: string | null;
  pcb_number?: string | null;
  starter_number: string;
  mac_address?: string | null;
  gateway_id?: number | null;
  device_status: 'READY' | 'DEPLOYED' | 'ASSIGNED' | 'TEST';
  created_by: number;
  motorDetails?: {
    name: string;
    hp: string;
  };
}

export interface PreparedSettingsData {
  starter_id: number;
  pcb_number: string;
  [key: string]: string | number | boolean;
}

// =================== STARTER BOX TYPES ===================
export interface StarterBoxWithMotor {
  id: number;
  created_by: number;
  gateway_id: number | null;
  power: number;
  signal_quality: number;
  network_type: string;
  motors: Array<{
    id: number;
    name: string;
    hp: string;
    state: string;
    mode: string;
    location_id: number | null;
    created_by: number;
  }>;
}

// =================== UTILITY TYPES ===================
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>>
  & {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys];

export type preparedLiveData = {
  payload_version: number;
  packet_number: number;
  line_voltage_r: number;
  line_voltage_y: number;
  line_voltage_b: number;
  avg_voltage: number;
  current_r: number;
  current_y: number;
  current_b: number;
  avg_current: number;
  power_present: number;
  motor_mode: number;
  motor_state: number;
  mode_description: string;
  motor_description: string;
  alert_code: number;
  alert_description: string;
  fault: number;
  fault_description: string;
  last_on_code: number;
  last_on_description: string;
  last_off_code: number;
  last_off_description: string;
  group_id: number;
  temp: number;
  time_stamp: string;
  payload_valid: boolean;
  payload_errors: string[];
  starter_id: number;
  gateway_id: number;
  user_id: number;
  motor_id: number,
};

export type previousPreparedLiveData = {
  power: number;
  created_by: number;
  id: number;
  user_id: number | null;
  gateway_id: number | null;
  signal_quality: number;
  network_type: string | null;
  motors: {
    created_by: number | null;
    id: number;
    name: string;
    mode: "AUTO" | "MANUAL"
    location_id: number | null;
    hp: string;
    state: number;
  }[];
}

export type motorBasedStarterDetails = {
  id: number;
  assigned_at: Date | null;
}