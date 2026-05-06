import { and, desc, eq, isNull } from "drizzle-orm";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import db from "../../database/configuration.js";
import { deviceStatusHistory } from "../../database/schemas/device-status-history.js";
import { motorStatusHistory } from "../../database/schemas/motor-status-history.js";
import { powerStatusHistory } from "../../database/schemas/power-status-history.js";
import { saveSingleRecord } from "./base-db-services.js";
const IST_TIMEZONE = "Asia/Kolkata";
function getIstDayKey(value) {
    const istDate = toZonedTime(value, IST_TIMEZONE);
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, "0");
    const day = String(istDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function getIstDayBoundariesUtc(dayKey) {
    const [y, m, d] = dayKey.split("-").map(Number);
    const start = fromZonedTime(new Date(y, m - 1, d, 0, 0, 0, 0), IST_TIMEZONE);
    const end = fromZonedTime(new Date(y, m - 1, d, 23, 59, 59, 999), IST_TIMEZONE);
    return { start, end };
}
function getMissingIstDayKeys(from, to) {
    const fromKey = getIstDayKey(from);
    const toKey = getIstDayKey(to);
    if (fromKey >= toKey)
        return [];
    const missing = [];
    // Start cursor at the IST midnight of the day after `from`
    const [fy, fm, fd] = fromKey.split("-").map(Number);
    const cursor = fromZonedTime(new Date(fy, fm - 1, fd, 0, 0, 0, 0), IST_TIMEZONE);
    cursor.setDate(cursor.getDate() + 1);
    while (getIstDayKey(cursor) < toKey) {
        missing.push(getIstDayKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return missing;
}
async function writeStatusHistoryIfChanged(params) {
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
    if (latestRecord && !isSameIstDay) {
        const missingDays = getMissingIstDayKeys(latestRecord.time_stamp, time_stamp);
        for (const dayKey of missingDays) {
            const { start, end } = getIstDayBoundariesUtc(dayKey);
            await saveSingleRecord(table, { starter_id, motor_id, status: latestRecord.status, time_stamp: start }, trx);
            await saveSingleRecord(table, { starter_id, motor_id, status: latestRecord.status, time_stamp: end }, trx);
        }
        // Always write a baseline record at the start of the current IST day
        // so that every day with telemetry data has a history entry at day-start.
        // Use the previous status since at IST midnight the device was still in
        // whatever state it had at the end of the previous day.
        const currentDayKey = getIstDayKey(time_stamp);
        const { start: currentDayStart } = getIstDayBoundariesUtc(currentDayKey);
        await saveSingleRecord(table, { starter_id, motor_id, status: latestRecord.status, time_stamp: currentDayStart }, trx);
    }
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
export async function writeMotorStatusHistoryIfChanged(params) {
    return await writeStatusHistoryIfChanged({
        table: motorStatusHistory,
        ...params,
    });
}
export async function writePowerStatusHistoryIfChanged(params) {
    return await writeStatusHistoryIfChanged({
        table: powerStatusHistory,
        ...params,
    });
}
export async function writeDeviceStatusHistoryIfChanged(params) {
    return await writeStatusHistoryIfChanged({
        table: deviceStatusHistory,
        ...params,
    });
}
