import { and, asc, eq, gte, lte } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceStatusHistory } from "../../database/schemas/device-status-history.js";
import { motorStatusHistory } from "../../database/schemas/motor-status-history.js";
import { powerStatusHistory } from "../../database/schemas/power-status-history.js";
import type { HistoryTable, StatusHistoryFilters } from "../../types/app-types.js";

export type { StatusHistoryFilters };

function buildWhere(table: HistoryTable, filters: StatusHistoryFilters) {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.starter_id !== undefined) {
    conditions.push(eq(table.starter_id, filters.starter_id));
  }
  if (filters.motor_id !== undefined) {
    conditions.push(eq(table.motor_id as any, filters.motor_id));
  }
  if (filters.from_date) {
    conditions.push(gte(table.time_stamp, new Date(filters.from_date)) as any);
  }
  if (filters.to_date) {
    const end = new Date(filters.to_date);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(table.time_stamp, end) as any);
  }
  if (filters.status) {
    conditions.push(eq(table.status, filters.status) as any);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function queryHistory(table: HistoryTable, filters: StatusHistoryFilters) {
  return db
    .select()
    .from(table as any)
    .where(buildWhere(table, filters))
    .orderBy(asc(table.time_stamp));
}

export async function getMotorStatusHistory(filters: StatusHistoryFilters = {}) {
  return queryHistory(motorStatusHistory, filters);
}

export async function getPowerStatusHistory(filters: StatusHistoryFilters = {}) {
  return queryHistory(powerStatusHistory, filters);
}

export async function getDeviceStatusHistory(filters: StatusHistoryFilters = {}) {
  return queryHistory(deviceStatusHistory, filters);
}
