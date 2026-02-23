import type { PgInsertValue } from "drizzle-orm/pg-core";
import type { AlertsFaults, AlertsFaultsTable } from "../database/schemas/alerts-faults.js";
import type { DeviceRunTime, DeviceRunTimeTable } from "../database/schemas/device-runtime.js";
import type { DeviceToken, DeviceTokensTable } from "../database/schemas/device-tokens.js";
import type { Field, FieldsTable } from "../database/schemas/fields.js";
import type { Gateway, GatewayTable } from "../database/schemas/gateways.js";
import type { Location, LocationsTable } from "../database/schemas/locations.js";
import type { MotorRunTime, MotorRunTimeTable } from "../database/schemas/motor-runtime.js";
import type { MotorSchedule, MotorScheduleTable } from "../database/schemas/motor-schedules.js";
import type { Motor, MotorsTable } from "../database/schemas/motors.js";
import type { Otp, OtpTable } from "../database/schemas/otp.js";
import type { StarterBox, StarterBoxTable } from "../database/schemas/starter-boxes.js";
import type { StarterDefaultSettings, StarterDefaultSettingsTable } from "../database/schemas/starter-default-settings.js";
import type { StarterDefaultSettingsLimits, StarterDefaultSettingsLimitsTable } from "../database/schemas/starter-default-settings-limits.js";
import type { StarterBoxParameters, StarterBoxParametersTable } from "../database/schemas/starter-parameters.js";
import type { StarterSettingsLimits, StarterSettingsLimitsTable } from "../database/schemas/starter-settings-limits.js";
import type { StarterSettings, StarterSettingsTable } from "../database/schemas/starter-settings.js";
import type { UserActivityLog, UserActivityLogsTable } from "../database/schemas/user-activity-logs.js";
import type { User, UsersTable } from "../database/schemas/users.js";
import type { DeviceTemperature, DeviceTemperatureTable } from "../database/schemas/device-temperature.js";

export type DBTable = UsersTable | LocationsTable | UserActivityLogsTable | OtpTable | DeviceTokensTable | FieldsTable | MotorsTable | StarterBoxTable | GatewayTable | StarterBoxParametersTable |
  MotorScheduleTable | AlertsFaultsTable | DeviceRunTimeTable | MotorRunTimeTable | StarterDefaultSettingsTable | StarterSettingsTable | StarterSettingsLimitsTable | StarterDefaultSettingsLimitsTable
  | StarterBoxParametersTable | DeviceTemperatureTable;

export type DBRecord<T extends DBTable> =
  T extends UsersTable ? User :
  T extends LocationsTable ? Location :
  T extends UserActivityLogsTable ? UserActivityLog :
  T extends OtpTable ? Otp :
  T extends DeviceTokensTable ? DeviceToken :
  T extends FieldsTable ? Field :
  T extends MotorsTable ? Motor :
  T extends StarterBoxTable ? StarterBox :
  T extends GatewayTable ? Gateway :
  T extends StarterBoxParametersTable ? StarterBoxParameters :
  T extends MotorScheduleTable ? MotorSchedule :
  T extends AlertsFaultsTable ? AlertsFaults :
  T extends DeviceRunTimeTable ? DeviceRunTime :
  T extends MotorRunTimeTable ? MotorRunTime :
  T extends StarterDefaultSettingsTable ? StarterDefaultSettings :
  T extends StarterSettingsLimitsTable ? StarterSettingsLimits :
  T extends StarterSettingsTable ? StarterSettings :
  T extends StarterDefaultSettingsLimitsTable ? StarterDefaultSettingsLimits :
  T extends DeviceTemperatureTable ? DeviceTemperature :
  never;

export type DBNewRecord<T extends DBTable> = PgInsertValue<T>;

export type DBTableColumns<T extends DBTable> = keyof DBRecord<T>;

export type SortDirection = "asc" | "desc";

export type Relations = "=" | "!=" | "<" | "<=" | ">" | ">=" | "ILIKE" | "BETWEEN" | "IN" | "IS NULL" | "IS NOT NULL" | "contains" | "or" | "LOWER";

export interface WhereQueryData<T extends DBTable> {
  columns: Array<keyof DBRecord<T>>;
  relations: Array<Relations>;
  values: unknown[];
}

export type WhereQueryDataWithOr<T extends DBTable> = {
  columns: Array<keyof DBRecord<T>>;
  relations: Array<Relations>;
  values: unknown[];
  or?: {
    columns: Array<keyof DBRecord<T>>;
    relations: Array<Relations>;
    values: unknown[];
  }[];
};

export type WhereQueryDataWithAnd<T extends DBTable> = {
  columns: Array<keyof DBRecord<T>>;
  relations: Array<Relations>;
  values: unknown[];
  or?: {
    columns: Array<keyof DBRecord<T>>;
    relations: Array<Relations>;
    values: unknown[];
  }[];
};


export interface OrderByQueryData<T extends DBTable> {
  columns: Array<DBTableColumns<T>>;
  values: SortDirection[];
}

export interface InQueryData<T extends DBTable> {
  key: keyof DBRecord<T>;
  values: unknown[];
}

export type UpdateRecordData<T extends DBTable> = Partial<Omit<DBRecord<T>, "id" | "created_at" | "updated_at">>;

export interface PaginationInfo {
  total_records: number;
  total_pages: number;
  page_size: number;
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
}

export interface PaginatedRecords<T extends DBTable> {
  pagination_info: PaginationInfo;
  records: DBRecord<T>[];
}

