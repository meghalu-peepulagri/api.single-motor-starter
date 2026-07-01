import { timeToMinutes } from "./motor-helper.js";
// =================== IST TIMEZONE HELPERS ===================
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function toIST(date) {
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
function isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek) {
    if (schedule.repeat === 1) {
        if (schedule.days_of_week.length === 0)
            return true;
        // Is today an intended day?
        if (!schedule.days_of_week.map(Number).includes(currentDayOfWeek))
            return false;
        // Is today's day currently active (not stopped via bit_wise_days)?
        if (schedule.bit_wise_days != null) {
            return !!((schedule.bit_wise_days >> currentDayOfWeek) & 1);
        }
        return true;
    }
    return schedule.schedule_start_date === currentDateNum;
}
function hasPassedEndTime(currentMinutes, startMinutes, endMinutes) {
    if (startMinutes < endMinutes)
        return currentMinutes >= endMinutes;
    return currentMinutes >= endMinutes && currentMinutes < startMinutes;
}
/** True when current time is BEFORE the window opens (window hasn't started yet today). */
function isBeforeWindow(currentMinutes, startMinutes, endMinutes) {
    if (startMinutes < endMinutes)
        return currentMinutes < startMinutes;
    // Wrap-around windows (e.g., 23:00 → 02:00): can't infer BEFORE/AFTER from time alone.
    return false;
}
/** Raw window span in minutes (handles wrap-around windows like 23:00 → 02:00). */
function windowSpanMinutes(schedule, startMinutes, endMinutes) {
    if (schedule.runtime_minutes != null)
        return schedule.runtime_minutes;
    return endMinutes > startMinutes
        ? endMinutes - startMinutes
        : (1440 - startMinutes) + endMinutes;
}
/**
 * CYCLIC only: total minutes the motor is expected to actually RUN across the whole
 * window. The motor alternates ON → OFF starting with ON, so we count only the ON
 * portions across every cycle that fits in the window.
 *   e.g. window 25m, on=5/off=5 → ON(5)·OFF(5)·ON(5)·OFF(5)·ON(5) → 3 ON cycles = 15m run.
 * Returns the full span as a safe fallback when cycle info is missing/invalid.
 */
function cyclicPlannedOnMinutes(schedule, startMinutes, endMinutes) {
    const span = windowSpanMinutes(schedule, startMinutes, endMinutes);
    const on = schedule.cycle_on_minutes ?? 0;
    const off = schedule.cycle_off_minutes ?? 0;
    if (on <= 0)
        return span; // no usable cyclic info → fall back to span
    const cycle = on + off;
    if (cycle <= 0)
        return on; // off missing → at least one ON period
    const fullCycles = Math.floor(span / cycle);
    const remainder = span - fullCycles * cycle;
    return fullCycles * on + Math.min(remainder, on);
}
function plannedDurationMinutes(schedule, startMinutes, endMinutes) {
    // CYCLIC only: the motor runs only during the "on" portions, so the expected run time
    // for COMPLETED is the TOTAL ON time across all cycles in the window — NOT the full span.
    // e.g. window 25m, on=5/off=5 → 3 ON cycles → run_time(15) == planned(15) → COMPLETED.
    // Time-based schedules fall through to the unchanged logic below.
    if (schedule.schedule_type === "CYCLIC" && schedule.cycle_on_minutes != null) {
        return cyclicPlannedOnMinutes(schedule, startMinutes, endMinutes);
    }
    if (schedule.runtime_minutes != null)
        return schedule.runtime_minutes;
    return endMinutes > startMinutes
        ? endMinutes - startMinutes
        : (1440 - startMinutes) + endMinutes;
}
// =================== TERMINAL STATUS RESOLVER ===================
function resolveTerminalStatus(schedule, startMinutes, endMinutes, now) {
    const planned = plannedDurationMinutes(schedule, startMinutes, endMinutes);
    const actual = schedule.actual_run_time ?? 0;
    if (!(schedule.actual_started_at ?? (schedule.actual_started_at ?? schedule.actual_start_time))) {
        return { id: schedule.id, newStatus: "MISSED", last_stopped_at: now };
    }
    if (actual >= planned) {
        return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
    }
    return { id: schedule.id, newStatus: "PARTIAL", last_stopped_at: now };
}
// =================== MAIN EVALUATOR ===================
export function evaluateScheduleStatus(schedule, now) {
    const ist = toIST(now);
    const currentMinutes = ist.totalMinutes;
    const currentDateNum = ist.dateNum;
    const currentDayOfWeek = ist.dayOfWeek;
    const startMinutes = timeToMinutes(schedule.start_time);
    const endMinutes = timeToMinutes(schedule.end_time);
    const windowPassed = hasPassedEndTime(currentMinutes, startMinutes, endMinutes);
    const windowBefore = isBeforeWindow(currentMinutes, startMinutes, endMinutes);
    const windowOpen = !windowPassed && !windowBefore;
    const isTodayActiveDate = isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek);
    const hasMoreRepeatRange = schedule.repeat === 1
        && !!schedule.schedule_end_date
        && currentDateNum <= schedule.schedule_end_date;
    // ── PENDING / SCHEDULED ──
    if (schedule.schedule_status === "PENDING" || schedule.schedule_status === "SCHEDULED") {
        if ((schedule.actual_started_at ?? schedule.actual_start_time) && isTodayActiveDate) {
            if (windowPassed) {
                if (hasMoreRepeatRange) {
                    return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
                }
                return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
            }
            // device reported start today — go RUNNING immediately (before or during window)
            return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
        }
        // actual_started_at set but not today's date → stay SCHEDULED
        if ((schedule.actual_started_at ?? schedule.actual_start_time)) {
            return null;
        }
        // No actual_start_time
        if (!isTodayValidForSchedule(schedule, currentDateNum, currentDayOfWeek))
            return null;
        // For wrap-around windows (e.g., 22:00→01:00), the gap between end and start
        // (e.g., 01:01–21:59) looks like "window passed" by hasPassedEndTime, but when
        // the schedule hasn't started yet we're simply before tonight's window — not missed.
        const isWrapAround = startMinutes > endMinutes;
        if (isWrapAround && windowPassed)
            return null;
        if (windowPassed) {
            // Device never ACKed and the window has passed → FAILED
            if (schedule.acknowledgement === 0)
                return { id: schedule.id, newStatus: "FAILED" };
            if (hasMoreRepeatRange) {
                return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
            }
            return resolveTerminalStatus(schedule, startMinutes, endMinutes, now); // → MISSED
        }
        return null;
    }
    // ── RUNNING ──
    if (schedule.schedule_status === "RUNNING") {
        // Demote only when device has NOT reported real start — if device already started,
        // trust the device and keep RUNNING even before the window opens.
        if (windowBefore && !(schedule.actual_started_at ?? schedule.actual_start_time)) {
            return { id: schedule.id, newStatus: "SCHEDULED" };
        }
        if ((schedule.actual_started_at ?? schedule.actual_start_time)) {
            // CYCLIC only: the motor runs only during the ON portions, so once the device-reported
            // run time reaches the TOTAL ON time across all cycles in the window, the schedule is
            // done — even while the window is still open and even if the device hasn't reported an
            // end time (actual_ended_at / live-data end time comes back null for cyclic).
            // e.g. window 25m, on=5/off=5 → 3 ON cycles → completes when run time reaches 15m.
            if (schedule.schedule_type === "CYCLIC" &&
                schedule.cycle_on_minutes != null &&
                (schedule.actual_run_time ?? 0) >= cyclicPlannedOnMinutes(schedule, startMinutes, endMinutes)) {
                if (hasMoreRepeatRange) {
                    return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
                }
                return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
            }
            if (schedule.actual_ended_at) {
                // device confirmed stop → resolve immediately regardless of window
                if (hasMoreRepeatRange) {
                    return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
                }
                return resolveTerminalStatus(schedule, startMinutes, endMinutes, now);
            }
            // no end reported yet → wait for window to pass
            if (windowOpen || windowBefore)
                return null;
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
        // is still open — but only if device has NOT reported a stop yet.
        // If actual_ended_at is set, motor already stopped — do not re-promote to RUNNING.
        if ((schedule.actual_started_at ?? schedule.actual_start_time) && !schedule.actual_ended_at && windowOpen) {
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
        if ((schedule.actual_started_at ?? schedule.actual_start_time) && !schedule.actual_ended_at && windowOpen) {
            return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
        }
        return null;
    }
    return null;
}
