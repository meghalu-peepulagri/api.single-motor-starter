import type { ContentfulStatusCode } from "hono/utils/http-status";
import { starterDispatch } from "../database/schemas/starter-dispatch.js";
import type { ValidatedUpdateDefaultSettingsLimits } from "../validations/schema/default-settings-limits.js";
import type { ValidatedUpdateDefaultSettings } from "../validations/schema/default-settings.js";
import type { validatedAddField } from "../validations/schema/field-validations.js";
import type { ValidatedAddLocation } from "../validations/schema/location-validations.js";
import type { ValidatedAddRepeatDays, ValidatedMotorSchedule, ValidatedMotorScheduleArray, ValidatedUpdateMotorSchedule } from "../validations/schema/motor-schedule-validators.js";
import type { validatedAddMotor, validatedUpdateMotor, validatedUpdateMotorTestRunStatus } from "../validations/schema/motor-validations.js";
import type { validatedAddStarter, validatedAssignLocationToStarter, validatedAssignStarter, validatedAssignStarterWeb, validatedReplaceStarter, validatedUpdateDeployedStatus } from "../validations/schema/starter-validations.js";
import type { ValidatedSignInEmail, ValidatedSignInPhone, ValidatedSignUpUser, ValidatedVerifyOtp } from "../validations/schema/user-validations.js";
import type { ValidatedAddStarterDispatch } from "../validations/schema/starter-dispatch-validations.js";
import type { ValidatedAddGateway, ValidatedAssignGatewayToUser, ValidatedRenameGateway, ValidatedUpdateGatewayLabel, ValidatedUpdateGatewayNumber } from "../validations/schema/gateway-validations.js";
import type { MotorStatusHistoryTable } from "../database/schemas/motor-status-history.js";
import type { PowerStatusHistoryTable } from "../database/schemas/power-status-history.js";
import type { DeviceStatusHistoryTable } from "../database/schemas/device-status-history.js";

export type ValidatedRequest = ValidatedSignUpUser | ValidatedSignInEmail | ValidatedAddLocation | ValidatedSignInPhone | ValidatedVerifyOtp | validatedAddField | validatedAddMotor | validatedUpdateMotor | validatedUpdateMotorTestRunStatus | validatedAddStarter | ValidatedMotorSchedule
  | ValidatedMotorScheduleArray | ValidatedUpdateMotorSchedule | ValidatedAddRepeatDays | validatedAssignStarter | validatedReplaceStarter | validatedAssignStarterWeb | validatedUpdateDeployedStatus | validatedAssignLocationToStarter | ValidatedUpdateDefaultSettings | ValidatedUpdateDefaultSettingsLimits | ValidatedAddStarterDispatch | ValidatedAddGateway | ValidatedUpdateGatewayLabel | ValidatedRenameGateway | ValidatedAssignGatewayToUser | ValidatedUpdateGatewayNumber;

export type AppActivity = "signup" | "signin-email" | "add-location" | "signin-phone" | "verify-otp" | "add-field" | "add-motor" | "update-motor" | "update-motor-test-run-status" | "add-starter" | "create-motor-schedule" | "create-bulk-motor-schedule" | "update-motor-schedule" | "add-repeat-days" | "assign-starter" | "replace-starter" |
  "assign-starter-web" | "update-deployed-status" | "assign-location-to-starter" | "update-default-settings" | "update-default-settings-limits" | "add-starter-dispatch" | "update-starter-dispatch" | "add-gateway" | "update-gateway-label" | "rename-gateway" | "assign-gateway" | "update-gateway-number";

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
  device_installed_location?: string | null;
  installation_photo_key?: string;
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

// =================== SCHEDULE EVALUATOR TYPES ===================
export interface ScheduleForEvaluation {
  id: number;
  schedule_type: "TIME_BASED" | "CYCLIC";
  schedule_status: string;
  start_time: string;   // 4-digit HHMM (e.g., "0005", "0600", "1430")
  end_time: string;     // 4-digit HHMM (e.g., "0020", "0700", "2359")
  schedule_start_date: number | null;  // Numeric YYMMDD (e.g., 260415)
  schedule_end_date: number | null;    // Numeric YYMMDD (e.g., 260416)
  days_of_week: number[];
  repeat: number;
  runtime_minutes: number | null;
  last_started_at: Date | null;
  enabled: boolean;
}

export interface ScheduleStatusUpdate {
  id: number;
  newStatus: "RUNNING" | "COMPLETED" | "WAITING_NEXT_CYCLE";
  last_started_at?: Date;
  last_stopped_at?: Date;
}

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

  // Schedule fields from device payload
  active_schedule_id: number | null;
  active_schedule_type: "TIME_BASED" | "CYCLIC" | null;
  active_schedule_start_time: string | null;      // HHMM — actual start time device is using
  active_schedule_runtime_minutes: number | null; // minutes
  active_schedule_end_time: string | null;        // HHMM — computed (start + runtime)
  active_schedule_missed_minutes: number | null;
  active_schedule_failure_at: Date | null;
  active_schedule_failure_reason: string | null;
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

// =================== DISPATCH SORTABLE COLUMNS ===================
export const DISPATCH_SORTABLE_COLUMNS: Record<string, any> = {
  id: starterDispatch.id,
  starter_id: starterDispatch.starter_id,
  customer_name: starterDispatch.customer_name,
  contact_number: starterDispatch.contact_number,
  address: starterDispatch.address,
  location: starterDispatch.location,
  sim_no: starterDispatch.sim_no,
  sim_recharge_end_date: starterDispatch.sim_recharge_end_date,
  warranty_end_date: starterDispatch.warranty_end_date,
  created_at: starterDispatch.created_at,
};

// =================== RUNTIME TYPES ===================
export interface RuntimeRecord {
  id: number;
  start_time: Date | string;
  end_time: Date | string | null;
  duration: string | null;
  time_stamp: string | null;
  motor_state: number | null;
  power_start: string | null;
  power_end: string | null;
  power_duration: string | null;
  power_state: number | null;
  offline_at?: Date | string | null;
}

export interface SplitRuntimeRecord {
  id: number;
  start_time: Date;
  end_time: Date | null;
  duration: string | null;
  time_stamp: string | null;
  motor_state: number | null;
  power_start: string | null;
  power_end: string | null;
  power_duration: string | null;
  power_state: number | null;
  offline_at?: Date | null;
}

export type MotorStateData = {
  state?: number | null;
  mode?: string | null;
  last_on_description?: string;
  last_off_description?: string;
};

// =================== STATUS HISTORY TYPES ===================
export type HistoryTable =
  | MotorStatusHistoryTable
  | PowerStatusHistoryTable
  | DeviceStatusHistoryTable;

export interface StatusHistoryFilters {
  starter_id?: number;
  motor_id?: number;
  from_date?: string;
  to_date?: string;
  status?: string;
}
