import { and, asc, eq, gte, lte } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceStatusHistory } from "../../database/schemas/device-status-history.js";
import { motorStatusHistory } from "../../database/schemas/motor-status-history.js";
import { powerStatusHistory } from "../../database/schemas/power-status-history.js";
function buildWhere(table, filters) {
    const conditions = [];
    if (filters.starter_id !== undefined) {
        conditions.push(eq(table.starter_id, filters.starter_id));
    }
    if (filters.motor_id !== undefined) {
        conditions.push(eq(table.motor_id, filters.motor_id));
    }
    if (filters.from_date) {
        conditions.push(gte(table.time_stamp, new Date(filters.from_date)));
    }
    if (filters.to_date) {
        const end = new Date(filters.to_date);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(table.time_stamp, end));
    }
    if (filters.status) {
        conditions.push(eq(table.status, filters.status));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
}
async function queryHistory(table, filters) {
    return db
        .select()
        .from(table)
        .where(buildWhere(table, filters))
        .orderBy(asc(table.time_stamp));
}
export async function getMotorStatusHistory(filters = {}) {
    return queryHistory(motorStatusHistory, filters);
}
export async function getPowerStatusHistory(filters = {}) {
    return queryHistory(powerStatusHistory, filters);
}
export async function getDeviceStatusHistory(filters = {}) {
    return queryHistory(deviceStatusHistory, filters);
}
