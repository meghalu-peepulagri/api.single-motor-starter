import type { PgInsertValue } from "drizzle-orm/pg-core";
import type { AlertsFaults, AlertsFaultsTable } from "../database/schemas/alerts-faults.js";
import type { DeviceToken, DeviceTokensTable } from "../database/schemas/device-tokens.js";
import type { Field, FieldsTable } from "../database/schemas/fields.js";
import type { Gateway, GatewayTable } from "../database/schemas/gateways.js";
import type { LocationsTable } from "../database/schemas/locations.js";
import type { MotorSchedule, MotorScheduleTable } from "../database/schemas/motor-schedules.js";
import type { Motor, MotorsTable } from "../database/schemas/motors.js";
import type { Otp, OtpTable } from "../database/schemas/otp.js";
import type { StarterBox, StarterBoxTable } from "../database/schemas/starter-boxes.js";
import type { StarterBoxParameters, StarterBoxParametersTable } from "../database/schemas/starter-parameters.js";
import type { UserActivityLog, UserActivityLogsTable } from "../database/schemas/user-activity-logs.js";
import type { User, UsersTable } from "../database/schemas/users.js";

export type DBTable = UsersTable | LocationsTable | UserActivityLogsTable | OtpTable | DeviceTokensTable | FieldsTable | MotorsTable | StarterBoxTable | GatewayTable | StarterBoxParametersTable |
  MotorScheduleTable | AlertsFaultsTable;

export type DBRecord<T extends DBTable> =
  T extends UsersTable ? User : any |
  T extends LocationsTable ? Location : any |
  T extends UserActivityLogsTable ? UserActivityLog : any |
  T extends OtpTable ? Otp : any |
  T extends DeviceTokensTable ? DeviceToken : any |
  T extends FieldsTable ? Field : any |
  T extends MotorsTable ? Motor : any |
  T extends StarterBoxTable ? StarterBox : any |
  T extends GatewayTable ? Gateway : any |
  T extends StarterBoxParametersTable ? StarterBoxParameters : any |
  T extends MotorScheduleTable ? MotorSchedule : any |
  T extends AlertsFaultsTable ? AlertsFaults : any;

export type DBNewRecord<T extends DBTable> = PgInsertValue<T>;

export type DBTableColumns<T extends DBTable> = keyof DBRecord<T>;

export type SortDirection = "asc" | "desc";

export type Relations = "=" | "!=" | "<" | "<=" | ">" | ">=" | "ILIKE" | "BETWEEN" | "IN" | "IS NULL" | "contains" | "or" | "LOWER";

export interface WhereQueryData<T extends DBTable> {
  columns: Array<keyof DBRecord<T>>;
  relations: Array<Relations>;
  values: any[];
}

export type WhereQueryDataWithOr<T extends DBTable> = {
  columns: Array<keyof DBRecord<T>>;
  relations: Array<Relations>;
  values: any[];
  or?: {
    columns: Array<keyof DBRecord<T>>;
    relations: Array<Relations>;
    values: any[];
  }[];
};

export type WhereQueryDataWithAnd<T extends DBTable> = {
  columns: Array<keyof DBRecord<T>>;
  relations: Array<Relations>;
  values: any[];
  or?: {
    columns: Array<keyof DBRecord<T>>;
    relations: Array<Relations>;
    values: any[];
  }[];
};


export interface OrderByQueryData<T extends DBTable> {
  columns: Array<DBTableColumns<T>>;
  values: SortDirection[];
}

export interface InQueryData<T extends DBTable> {
  key: keyof DBRecord<T>;
  values: any[];
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

