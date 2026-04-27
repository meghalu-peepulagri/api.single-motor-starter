import { and, asc, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
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
    const start = new Date(`${filters.from_date.split('T')[0]}T00:00:00+05:30`);
    conditions.push(gte(table.time_stamp, start) as any);
  }
  if (filters.to_date) {
    const end = new Date(`${filters.to_date.split('T')[0]}T23:59:59.999+05:30`);
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

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export interface MotorRuntimeFilters {
  starter_id: number;
  motor_id: number;
  from_date: string;
  to_date: string;
}

interface StatusEvent {
  status: string;
  time_stamp: Date;
}

interface TimeRange {
  start: Date;
  end: Date;
}

function buildStatusRanges(params: {
  previousStatus?: string | null;
  events: StatusEvent[];
  activeStatus: string;
  rangeStart: Date;
  rangeEnd: Date;
}): TimeRange[] {
  const { previousStatus, events, activeStatus, rangeStart, rangeEnd } = params;
  const ranges: TimeRange[] = [];
  let currentStatus = previousStatus ?? null;
  let openStart: Date | null = currentStatus === activeStatus ? rangeStart : null;

  for (const event of events) {
    if (openStart !== null && event.time_stamp.getTime() > openStart.getTime()) {
      // Clamp the end time to rangeEnd if the event happens after
      const clampedEnd = event.time_stamp > rangeEnd ? rangeEnd : event.time_stamp;
      if (clampedEnd.getTime() > openStart.getTime()) {
        ranges.push({ start: openStart, end: clampedEnd });
      }
    }

    currentStatus = event.status;
    
    // If turning active, start the range. If the event is before rangeStart, clamp to rangeStart
    if (currentStatus === activeStatus) {
        openStart = event.time_stamp < rangeStart ? rangeStart : event.time_stamp;
    } else {
        openStart = null;
    }
  }

  if (openStart !== null) {
    const now = new Date();
    // Cap the end time so we don't calculate into the future
    const maxEnd = rangeEnd > now ? now : rangeEnd;
    
    if (maxEnd.getTime() > openStart.getTime()) {
      ranges.push({ start: openStart, end: maxEnd });
    }
  }

  return ranges;
}

function sumRangeMs(ranges: TimeRange[]): number {
  return ranges.reduce((sum, range) => sum + (range.end.getTime() - range.start.getTime()), 0);
}

function sumOverlapMs(primaryRanges: TimeRange[], blockedRanges: TimeRange[]): number {
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
    } else {
      blockedIndex += 1;
    }
  }

  return overlapMs;
}

export async function getMotorOnRuntime(filters: MotorRuntimeFilters) {
  // Always use IST (+05:30) to compute daily boundaries regardless of server timezone
  const rangeStart = new Date(`${filters.from_date.split('T')[0]}T00:00:00+05:30`);
  const rangeEnd = new Date(`${filters.to_date.split('T')[0]}T23:59:59.999+05:30`);

  const motorScope = and(
    eq(motorStatusHistory.starter_id, filters.starter_id),
    eq(motorStatusHistory.motor_id, filters.motor_id),
  );
  const deviceScope = and(
    eq(deviceStatusHistory.starter_id, filters.starter_id),
    isNull(deviceStatusHistory.motor_id),
  );

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

  // Only count motor ON time from events that actually happened within the
  // queried date range. We do NOT carry over a pre-range "ON" status — if the
  // motor was already ON from the previous night, that time belongs to that
  // previous day, not this one.
  const motorOnRanges = buildStatusRanges({
    previousStatus: null,
    events: motorEventsInRange,
    activeStatus: "ON",
    rangeStart,
    rangeEnd,
  });

  // If the device was INACTIVE before the range but motor events exist within
  // the range, those motor events PROVE the device came back online — we just
  // don't have an explicit ACTIVE event logged for that comeback. Carrying the
  // stale INACTIVE forward would zero out all motor runtime for the day, so we
  // reset it to null (treat device as ACTIVE at rangeStart) in that case.
  const effectivePreDeviceStatus =
    preDeviceRecord?.status === "INACTIVE" && motorEventsInRange.length > 0
      ? null   // device clearly came back online; ignore stale INACTIVE carry-over
      : preDeviceRecord?.status ?? null;

  const deviceInactiveRanges = buildStatusRanges({
    previousStatus: effectivePreDeviceStatus,
    events: deviceEventsInRange,
    activeStatus: "INACTIVE",
    rangeStart,
    rangeEnd,
  });

  const totalMotorOnMs = sumRangeMs(motorOnRanges);

  // A motor event (ON or OFF) is proof the device was communicating at that
  // exact timestamp. If a motor event falls inside a device INACTIVE window,
  // that window is unreliable — exclude it from the inactive overlap so we
  // don't cancel out motor runtime that genuinely happened.
  const motorEventTimes = motorEventsInRange.map(e => e.time_stamp.getTime());
  const reliableInactiveRanges = deviceInactiveRanges.filter(range =>
    !motorEventTimes.some(t => t >= range.start.getTime() && t <= range.end.getTime())
  );

  const inactiveOverlapMs = sumOverlapMs(motorOnRanges, reliableInactiveRanges);
  const totalMs = Math.max(0, totalMotorOnMs - inactiveOverlapMs);

  return {
    total_on_duration_formatted: formatDuration(totalMs),
  };
}
