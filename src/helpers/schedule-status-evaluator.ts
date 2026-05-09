import { timeToMinutes } from "./motor-helper.js";
import type { ScheduleForEvaluation, ScheduleStatusUpdate } from "../types/app-types.js";

// =================== IST TIMEZONE HELPERS ===================

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(date: Date) {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const yy = istTime.getUTCFullYear() - 2000;
  const mm = istTime.getUTCMonth() + 1;
  const dd = istTime.getUTCDate();
  return {
    totalMinutes: istTime.getUTCHours() * 60 + istTime.getUTCMinutes(),
    dayOfWeek: istTime.getUTCDay(),
    dateNum: yy * 10000 + mm * 100 + dd,
  };
}

// =================== HELPERS ===================

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

function hasPassedEndTime(currentMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes < endMinutes) return currentMinutes >= endMinutes;
  return currentMinutes >= endMinutes && currentMinutes < startMinutes;
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
  const windowPassed = hasPassedEndTime(currentMinutes, startMinutes, endMinutes);
  const hasActualCompletion = schedule.actual_run_time != null || schedule.actual_end_time != null;

  // ── PENDING / SCHEDULED ──
  if (schedule.schedule_status === "PENDING" || schedule.schedule_status === "SCHEDULED") {
    // Device reported actual start → use actual times
    if (schedule.actual_start_time) {
      if (!hasActualCompletion) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };

      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    // No actual start — use scheduled window only to detect MISSED
    if (!isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek)) return null;

    if (windowPassed) {
      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED (actual_start_time null)
    }

    return null; // window not yet passed, wait
  }

  // ── RUNNING ──
  if (schedule.schedule_status === "RUNNING") {
    // Device reported actual start and completion → resolve
    if (schedule.actual_start_time && hasActualCompletion) {
      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    // No actual data but window has passed → force MISSED
    if (!schedule.actual_start_time && windowPassed) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED
    }

    return null; // still running or waiting for device report
  }

  // ── WAITING_NEXT_CYCLE ──
  if (schedule.schedule_status === "WAITING_NEXT_CYCLE") {
    if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    if (schedule.actual_start_time) {
      if (!hasActualCompletion) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    return null; // wait for device to report
  }

  return null;
}
