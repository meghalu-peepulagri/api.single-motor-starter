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
    dateNum: yy * 10000 + mm * 100 + dd, // Numeric YYMMDD
  };
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
  const { dateNum: currentDateNum } = toIST(now);

  const startMinutes = timeToMinutes(schedule.start_time);
  const endMinutes = timeToMinutes(schedule.end_time);

  const hasActualCompletion = schedule.actual_run_time != null || schedule.actual_end_time != null;

  // ── PENDING → RUNNING / terminal ──
  if (schedule.schedule_status === "PENDING") {
    if (!schedule.actual_start_time) return null;
    if (!hasActualCompletion) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };

    if (schedule.repeat === 1) {
      if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
        return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
      }
      return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
    }
    return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
  }

  // ── SCHEDULED → RUNNING / terminal ──
  if (schedule.schedule_status === "SCHEDULED") {
    if (!schedule.actual_start_time) return null;
    if (!hasActualCompletion) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };

    if (schedule.repeat === 1) {
      if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
        return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
      }
      return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
    }
    return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
  }

  // ── RUNNING → COMPLETED / PARTIAL / MISSED / WAITING_NEXT_CYCLE ──
  if (schedule.schedule_status === "RUNNING") {
    if (!schedule.actual_start_time) return null;
    if (!hasActualCompletion) return null;

    if (schedule.repeat === 1) {
      if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
        return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
      }
      return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
    }
    return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
  }

  // ── WAITING_NEXT_CYCLE → RUNNING / terminal ──
  if (schedule.schedule_status === "WAITING_NEXT_CYCLE") {
    if (schedule.schedule_end_date && currentDateNum > schedule.schedule_end_date) {
      return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
    }
    if (!schedule.actual_start_time) return null;
    if (!hasActualCompletion) return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
    return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
  }

  return null;
}
