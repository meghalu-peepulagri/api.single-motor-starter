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
  const hasActualEnd = !!schedule.actual_end_time;
  const actualRunTime = schedule.actual_run_time ?? null;

  let newStatus: "COMPLETED" | "PARTIAL" | "MISSED";

  if (!hasActualStart) {
    newStatus = "MISSED";
  } else if (hasActualEnd && actualRunTime !== null && actualRunTime >= plannedMinutes - 1) {
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
  // actual_end_time is the true completion signal — actual_run_time is a live counter, not a stop signal
  const deviceReportedEnd = schedule.actual_end_time != null;

  // ── PENDING / SCHEDULED ──
  if (schedule.schedule_status === "PENDING" || schedule.schedule_status === "SCHEDULED") {
    if (schedule.actual_start_time) {
      if (deviceReportedEnd) {
        // Device sent actual_end_time → motor has stopped, resolve terminal
        if (schedule.repeat === 1) {
          if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
            return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
          }
          return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
        }
        return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
      }

      // No actual_end_time → motor is still running or connection dropped
      if (!windowPassed) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };

      // Window closed, no actual_end_time — started but device never reported end → PARTIAL
      return { id: schedule.id, newStatus: "PARTIAL", last_stopped_at: now };
    }

    // No actual start
    if (!isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek)) return null;

    if (windowPassed) {
      // No ACK → device never received the schedule, window gone → FAILED
      if (schedule.acknowledgement === 0) return { id: schedule.id, newStatus: "FAILED" };

      if (schedule.repeat === 1) {
        if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
          return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED
        }
        return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
      }
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED
    }

    return null;
  }

  // ── RUNNING ──
  if (schedule.schedule_status === "RUNNING") {
    if (schedule.actual_start_time) {
      if (deviceReportedEnd) {
        // Device sent actual_end_time → motor has stopped, resolve terminal
        if (schedule.repeat === 1) {
          if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
            return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
          }
          return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
        }
        return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
      }

      // No actual_end_time but window closed — started but device never reported end → PARTIAL
      if (windowPassed) {
        return { id: schedule.id, newStatus: "PARTIAL", last_stopped_at: now };
      }

      return null; // window open, still running
    }

    // No actual start but window passed → MISSED
    if (windowPassed) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    return null;
  }

  // ── PARTIAL ──
  if (schedule.schedule_status === "PARTIAL") {
    if (deviceReportedEnd && schedule.actual_run_time != null) {
      const plannedMinutes = endMinutes > startMinutes
        ? endMinutes - startMinutes
        : (1440 - startMinutes) + endMinutes;
      if (schedule.actual_run_time >= plannedMinutes - 1) {
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

    if (schedule.actual_start_time) {
      if (!deviceReportedEnd) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }

    return null;
  }

  return null;
}
