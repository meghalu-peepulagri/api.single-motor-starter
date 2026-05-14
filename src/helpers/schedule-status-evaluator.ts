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

    // Is today an intended day?
    if (!schedule.days_of_week.map(Number).includes(currentDayOfWeek)) return false;

    // Is today's day currently active (not stopped via bit_wise_days)?
    if (schedule.bit_wise_days != null) {
      return !!((schedule.bit_wise_days >> currentDayOfWeek) & 1);
    }

    return true;
  }
  return schedule.schedule_start_date === currentDateNum;
}

function hasPassedEndTime(currentMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes < endMinutes) return currentMinutes >= endMinutes;
  return currentMinutes >= endMinutes && currentMinutes < startMinutes;
}

function plannedDurationMinutes(
  schedule: ScheduleForEvaluation,
  startMinutes: number,
  endMinutes: number,
): number {
  if (schedule.runtime_minutes != null) return schedule.runtime_minutes;
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : (1440 - startMinutes) + endMinutes;
}

// =================== TERMINAL STATUS RESOLVER ===================

function resolveTerminalStatus(
  schedule: ScheduleForEvaluation,
  startMinutes: number,
  endMinutes: number,
  now: Date,
): ScheduleStatusUpdate {
  const planned = plannedDurationMinutes(schedule, startMinutes, endMinutes);
  const actual = schedule.actual_run_time ?? 0;

  if (!schedule.actual_start_time) {
    return { id: schedule.id, newStatus: "MISSED", last_stopped_at: now };
  }
  if (actual >= planned) {
    return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
  }
  return { id: schedule.id, newStatus: "PARTIAL", last_stopped_at: now };
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

  const hasMoreRepeatRange = schedule.repeat === 1
    && !!schedule.schedule_end_date
    && currentDateNum <= schedule.schedule_end_date;

  // ── PENDING / SCHEDULED ──
  if (schedule.schedule_status === "PENDING" || schedule.schedule_status === "SCHEDULED") {
    if (schedule.actual_start_time) {
      // Motor has started. While the window is still open it MUST be RUNNING —
      // do not compare actual_run_time against planned mid-window (that path was
      // emitting false PARTIALs).
      if (!windowPassed) {
        return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
      }
      // Window closed → resolve terminal (or wait for next cycle on repeats).
      if (hasMoreRepeatRange) {
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    // No actual_start_time
    if (!isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek)) return null;

    if (windowPassed) {
      // Device never ACKed and the window has passed → FAILED
      if (schedule.acknowledgement === 0) return { id: schedule.id, newStatus: "FAILED" };

      if (hasMoreRepeatRange) {
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED
    }

    return null;
  }

  // ── RUNNING ──
  if (schedule.schedule_status === "RUNNING") {
    if (schedule.actual_start_time) {
      // Window still open → stay RUNNING. Never resolve terminal mid-window,
      // even if the device has reported an actual_end_time.
      if (!windowPassed) return null;

      if (hasMoreRepeatRange) {
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    // RUNNING in DB but no actual_start_time? Inconsistent — handle by window.
    if (windowPassed) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }
    return null;
  }

  // ── PARTIAL ──
  if (schedule.schedule_status === "PARTIAL") {
    // Self-heal rows that were prematurely flipped to PARTIAL while the window
    // is still open. As soon as the list endpoint is hit, they bounce back to RUNNING.
    if (schedule.actual_start_time && !windowPassed) {
      return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
    }

    // Window closed — if actual_run_time catches up to planned, promote to COMPLETED.
    if (schedule.actual_run_time != null) {
      const planned = plannedDurationMinutes(schedule, startMinutes, endMinutes);
      if (schedule.actual_run_time >= planned) {
        return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
      }
    }
    return null;
  }

  // ── WAITING_NEXT_CYCLE ──
  if (schedule.schedule_status === "WAITING_NEXT_CYCLE") {
    if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    if (schedule.actual_start_time && !windowPassed) {
      return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
    }
    return null;
  }

  return null;
}
