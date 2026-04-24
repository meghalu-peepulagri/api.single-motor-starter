import { and, asc, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
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
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}
function buildStatusRanges(params) {
    const { previousStatus, events, activeStatus, rangeStart, rangeEnd } = params;
    const ranges = [];
    let currentStatus = previousStatus ?? null;
    let openStart = currentStatus === activeStatus ? rangeStart : null;
    for (const event of events) {
        if (openStart !== null && event.time_stamp.getTime() > openStart.getTime()) {
            ranges.push({ start: openStart, end: event.time_stamp });
        }
        currentStatus = event.status;
        openStart = currentStatus === activeStatus ? event.time_stamp : null;
    }
    if (openStart !== null && rangeEnd.getTime() > openStart.getTime()) {
        ranges.push({ start: openStart, end: rangeEnd });
    }
    return ranges;
}
function sumRangeMs(ranges) {
    return ranges.reduce((sum, range) => sum + (range.end.getTime() - range.start.getTime()), 0);
}
function sumOverlapMs(primaryRanges, blockedRanges) {
    let overlapMs = 0;
    let primaryIndex = 0;
    let blockedIndex = 0;
    while (primaryIndex < primaryRanges.length && blockedIndex < blockedRanges.length) {
        const primary = primaryRanges[primaryIndex];
        const blocked = blockedRanges[blockedIndex];
        const overlapStart = Math.max(primary.start.getTime(), blocked.start.getTime());
        const overlapEnd = Math.min(primary.end.getTime(), blocked.end.getTime());
        if (overlapEnd > overlapStart) {
            overlapMs += overlapEnd - overlapStart;
        }
        if (primary.end.getTime() <= blocked.end.getTime()) {
            primaryIndex += 1;
        }
        else {
            blockedIndex += 1;
        }
    }
    return overlapMs;
}
export async function getMotorOnRuntime(filters) {
    const rangeStart = new Date(filters.from_date);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(filters.to_date);
    rangeEnd.setHours(23, 59, 59, 999);
    const motorScope = and(eq(motorStatusHistory.starter_id, filters.starter_id), eq(motorStatusHistory.motor_id, filters.motor_id));
    const deviceScope = and(eq(deviceStatusHistory.starter_id, filters.starter_id), isNull(deviceStatusHistory.motor_id));
    const [preMotorRecord] = await db
        .select({ status: motorStatusHistory.status, time_stamp: motorStatusHistory.time_stamp })
        .from(motorStatusHistory)
        .where(and(motorScope, lt(motorStatusHistory.time_stamp, rangeStart)))
        .orderBy(desc(motorStatusHistory.time_stamp))
        .limit(1);
    const motorEventsInRange = await db
        .select({ status: motorStatusHistory.status, time_stamp: motorStatusHistory.time_stamp })
        .from(motorStatusHistory)
        .where(and(motorScope, gte(motorStatusHistory.time_stamp, rangeStart), lte(motorStatusHistory.time_stamp, rangeEnd)))
        .orderBy(asc(motorStatusHistory.time_stamp));
    const [preDeviceRecord] = await db
        .select({ status: deviceStatusHistory.status, time_stamp: deviceStatusHistory.time_stamp })
        .from(deviceStatusHistory)
        .where(and(deviceScope, lt(deviceStatusHistory.time_stamp, rangeStart)))
        .orderBy(desc(deviceStatusHistory.time_stamp))
        .limit(1);
    const deviceEventsInRange = await db
        .select({ status: deviceStatusHistory.status, time_stamp: deviceStatusHistory.time_stamp })
        .from(deviceStatusHistory)
        .where(and(deviceScope, gte(deviceStatusHistory.time_stamp, rangeStart), lte(deviceStatusHistory.time_stamp, rangeEnd)))
        .orderBy(asc(deviceStatusHistory.time_stamp));
    const motorOnRanges = buildStatusRanges({
        previousStatus: preMotorRecord?.status,
        events: motorEventsInRange,
        activeStatus: "ON",
        rangeStart,
        rangeEnd,
    });
    const deviceInactiveRanges = buildStatusRanges({
        previousStatus: preDeviceRecord?.status,
        events: deviceEventsInRange,
        activeStatus: "INACTIVE",
        rangeStart,
        rangeEnd,
    });
    const totalMotorOnMs = sumRangeMs(motorOnRanges);
    const inactiveOverlapMs = sumOverlapMs(motorOnRanges, deviceInactiveRanges);
    const totalMs = Math.max(0, totalMotorOnMs - inactiveOverlapMs);
    return {
        total_on_duration_formatted: formatDuration(totalMs),
    };
}
