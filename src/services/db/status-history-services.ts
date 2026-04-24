import { and, desc, eq, isNull } from "drizzle-orm";
import { toZonedTime } from "date-fns-tz";
import db from "../../database/configuration.js";
import { deviceStatusHistory } from "../../database/schemas/device-status-history.js";
import { motorStatusHistory } from "../../database/schemas/motor-status-history.js";
import { powerStatusHistory } from "../../database/schemas/power-status-history.js";
import { saveSingleRecord } from "./base-db-services.js";

type DbTransaction = Parameters<Parameters<typeof db["transaction"]>[0]>[0];

type StatusHistoryTable = typeof motorStatusHistory | typeof powerStatusHistory | typeof deviceStatusHistory;

const IST_TIMEZONE = "Asia/Kolkata";

function getIstDayKey(value: Date): string {
  const istDate = toZonedTime(value, IST_TIMEZONE);
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, "0");
  const day = String(istDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function writeStatusHistoryIfChanged(params: {
  table: StatusHistoryTable;
  starter_id: number;
  motor_id?: number | null;
  status: string;
  time_stamp: Date;
  trx?: DbTransaction;
}) {
  const { table, starter_id, motor_id = null, status, time_stamp, trx } = params;
  const queryBuilder = trx ?? db;

  const scopeConditions = [
    eq(table.starter_id, starter_id),
    motor_id === null ? isNull(table.motor_id) : eq(table.motor_id, motor_id),
  ];

  const [latestRecord] = await queryBuilder
    .select({
      status: table.status,
      time_stamp: table.time_stamp,
    })
    .from(table)
    .where(and(...scopeConditions))
    .orderBy(desc(table.time_stamp), desc(table.id))
    .limit(1);

  const isSameStatus = latestRecord?.status === status;
  const isSameIstDay = latestRecord?.time_stamp
    ? getIstDayKey(latestRecord.time_stamp) === getIstDayKey(time_stamp)
    : false;

  if (isSameStatus && isSameIstDay) {
    return null;
  }

  return await saveSingleRecord(table, {
    starter_id,
    motor_id,
    status,
    time_stamp,
  }, trx);
}

export async function writeMotorStatusHistoryIfChanged(params: {
  starter_id: number;
  motor_id: number;
  status: "ON" | "OFF";
  time_stamp: Date;
  trx?: DbTransaction;
}) {
  return await writeStatusHistoryIfChanged({
    table: motorStatusHistory,
    ...params,
  });
}

export async function writePowerStatusHistoryIfChanged(params: {
  starter_id: number;
  motor_id?: number | null;
  status: "ON" | "OFF";
  time_stamp: Date;
  trx?: DbTransaction;
}) {
  return await writeStatusHistoryIfChanged({
    table: powerStatusHistory,
    ...params,
  });
}

export async function writeDeviceStatusHistoryIfChanged(params: {
  starter_id: number;
  motor_id?: number | null;
  status: "ACTIVE" | "INACTIVE";
  time_stamp: Date;
  trx?: DbTransaction;
}) {
  return await writeStatusHistoryIfChanged({
    table: deviceStatusHistory,
    ...params,
  });
}
