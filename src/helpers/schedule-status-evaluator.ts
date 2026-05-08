import { timeToMinutes } from "./motor-helper.js";
import type { ScheduleForEvaluation, ScheduleStatusUpdate } from "../types/app-types.js";

// =================== IST TIMEZONE HELPERS ===================

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 in milliseconds

function toIST(date: Date) {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const yy = istTime.getUTCFullYear() - 2000;
  const mm = istTime.getUTCMonth() + 1;
  const dd = istTime.getUTCDate();
  return {
    totalMinutes: istTime.getUTCHours() * 60 + istTime.getUTCMinutes(),
    dayOfWeek: istTime.getUTCDay(), // 0=Sunday
    dateNum: yy * 10000 + mm * 100 + dd, // Numeric YYMMDD
  };
}

// =================== INTERNAL HELPERS ===================

function isTodayValidForSchedule(
  schedule: ScheduleForEvaluation,
  currentDateNum: number,
  currentDayOfWeek: number,
): boolean {
  if (schedule.repeat === 1) {
    if (schedule.days_of_week.length === 0) return true;
    return schedule.days_of_week.map(Number).includes(currentDayOfWeek);
  }
  return schedule.schedule_start_date === currentDateNum;
}

function hasPassedEndTime(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes < endMinutes) {
    return currentMinutes >= endMinutes;
  }
  return currentMinutes >= endMinutes && currentMinutes < startMinutes;
}

function isWithinTimeWindow(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// =================== TERMINAL STATUS RESOLVER ===================

function resolveTerminalStatus(
  schedule: ScheduleForEvaluation,
  startMinutes: number,
  endMinutes: number,
  now: Date,
): ScheduleStatusUpdate {
  const plannedMinutes = endMinutes > startMinutes
    ? endMinutes - startMinutes
    : (1440 - startMinutes) + endMinutes;

  const hasActualStart = !!schedule.actual_start_time;
  const actualRunTime = schedule.actual_run_time ?? null;

  let newStatus: "COMPLETED" | "PARTIAL" | "MISSED";

  if (!hasActualStart) {
    newStatus = "MISSED";
  } else if (actualRunTime !== null && actualRunTime >= plannedMinutes - 1) {
    newStatus = "COMPLETED";
  } else {
    newStatus = "PARTIAL";
  }

  return { id: schedule.id, newStatus, last_stopped_at: now };
}

// =================== MAIN EVALUATOR ===================

export function evaluateScheduleStatus(
  schedule: ScheduleForEvaluation,
  now: Date,
): ScheduleStatusUpdate | null {
  const ist = toIST(now);
  const currentMinutes = ist.totalMinutes;
  const currentDateNum = ist.dateNum;
  const currentDayOfWeek = ist.dayOfWeek;

  const startMinutes = timeToMinutes(schedule.start_time);
  const endMinutes = timeToMinutes(schedule.end_time);
  const effectiveRuntime = schedule.actual_run_time || schedule.runtime_minutes;
  const isTodayValid = isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek);

  // ── PENDING → RUNNING / COMPLETED / WAITING_NEXT_CYCLE ──
  if (schedule.schedule_status === "PENDING") {
    if (!isTodayValid) return null;

    if (isWithinTimeWindow(currentMinutes, startMinutes, endMinutes)) {
      return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
    }

    if (hasPassedEndTime(currentMinutes, startMinutes, endMinutes)) {
      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return { id: schedule.id, newStatus: "MISSED", last_stopped_at: now };
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return { id: schedule.id, newStatus: "MISSED", last_stopped_at: now };
    }

    return null;
  }

  // ── SCHEDULED → RUNNING / WAITING_NEXT_CYCLE / COMPLETED (missed window) ──
  if (schedule.schedule_status === "SCHEDULED") {
    if (!isTodayValid) return null;

    if (isWithinTimeWindow(currentMinutes, startMinutes, endMinutes)) {
      return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
    }

    if (hasPassedEndTime(currentMinutes, startMinutes, endMinutes)) {
      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    return null;
  }

  // ── RUNNING → COMPLETED / PARTIAL / MISSED / WAITING_NEXT_CYCLE ──
  if (schedule.schedule_status === "RUNNING") {
    let shouldComplete = false;

    if (hasPassedEndTime(currentMinutes, startMinutes, endMinutes)) {
      shouldComplete = true;
    }

    if (!shouldComplete && effectiveRuntime && schedule.last_started_at) {
      const elapsedMs = now.getTime() - new Date(schedule.last_started_at).getTime();
      const elapsedMinutes = elapsedMs / 60000;
      if (elapsedMinutes >= effectiveRuntime) {
        shouldComplete = true;
      }
    }

    if (shouldComplete) {
      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }
    return null;
  }

  // ── WAITING_NEXT_CYCLE → RUNNING / COMPLETED / PARTIAL / MISSED ──
  if (schedule.schedule_status === "WAITING_NEXT_CYCLE") {
    if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    if (!isTodayValid) return null;

    if (isWithinTimeWindow(currentMinutes, startMinutes, endMinutes)) {
      return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
    }
    return null;
  }

  return null;
}
