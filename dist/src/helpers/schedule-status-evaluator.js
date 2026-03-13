import { timeToMinutes } from "./motor-helper.js";
// =================== IST TIMEZONE HELPERS ===================
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 in milliseconds
function toIST(date) {
    const istTime = new Date(date.getTime() + IST_OFFSET_MS);
    return {
        totalMinutes: istTime.getUTCHours() * 60 + istTime.getUTCMinutes(),
        dayOfWeek: istTime.getUTCDay(), // 0=Sunday
        dateStr: `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, "0")}-${String(istTime.getUTCDate()).padStart(2, "0")}`,
    };
}
// =================== INTERNAL HELPERS ===================
function isTodayValidForSchedule(schedule, currentDateStr, currentDayOfWeek) {
    if (schedule.repeat === 1) {
        if (schedule.days_of_week.length === 0)
            return true;
        return schedule.days_of_week.map(Number).includes(currentDayOfWeek);
    }
    return schedule.schedule_start_date === currentDateStr;
}
function hasPassedEndTime(currentMinutes, startMinutes, endMinutes) {
    if (startMinutes < endMinutes) {
        return currentMinutes >= endMinutes;
    }
    return currentMinutes >= endMinutes && currentMinutes < startMinutes;
}
function isWithinTimeWindow(currentMinutes, startMinutes, endMinutes) {
    if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
// =================== MAIN EVALUATOR ===================
export function evaluateScheduleStatus(schedule, now) {
    const ist = toIST(now);
    const currentMinutes = ist.totalMinutes;
    const currentDateStr = ist.dateStr;
    const currentDayOfWeek = ist.dayOfWeek;
    const startMinutes = timeToMinutes(schedule.start_time);
    const endMinutes = timeToMinutes(schedule.end_time);
    const isTodayValid = isTodayValidForSchedule(schedule, currentDateStr, currentDayOfWeek);
    // ── SCHEDULED → RUNNING / WAITING_NEXT_CYCLE / COMPLETED (missed window) ──
    if (schedule.schedule_status === "SCHEDULED") {
        if (!isTodayValid)
            return null;
        if (isWithinTimeWindow(currentMinutes, startMinutes, endMinutes)) {
            return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
        }
        if (hasPassedEndTime(currentMinutes, startMinutes, endMinutes)) {
            if (schedule.repeat === 1) {
                if (schedule.schedule_end_date && currentDateStr > schedule.schedule_end_date) {
                    return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
                }
                return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
            }
            return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
        }
        return null;
    }
    // ── RUNNING → COMPLETED / WAITING_NEXT_CYCLE ──
    if (schedule.schedule_status === "RUNNING") {
        let shouldComplete = false;
        if (hasPassedEndTime(currentMinutes, startMinutes, endMinutes)) {
            shouldComplete = true;
        }
        if (!shouldComplete && schedule.runtime_minutes && schedule.last_started_at) {
            const elapsedMs = now.getTime() - new Date(schedule.last_started_at).getTime();
            const elapsedMinutes = elapsedMs / 60000;
            if (elapsedMinutes >= schedule.runtime_minutes) {
                shouldComplete = true;
            }
        }
        if (shouldComplete) {
            if (schedule.repeat === 1) {
                if (schedule.schedule_end_date && currentDateStr > schedule.schedule_end_date) {
                    return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
                }
                return { id: schedule.id, newStatus: "WAITING_NEXT_CYCLE", last_stopped_at: now };
            }
            return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
        }
        return null;
    }
    // ── WAITING_NEXT_CYCLE → RUNNING / COMPLETED ──
    if (schedule.schedule_status === "WAITING_NEXT_CYCLE") {
        if (schedule.schedule_end_date && currentDateStr > schedule.schedule_end_date) {
            return { id: schedule.id, newStatus: "COMPLETED", last_stopped_at: now };
        }
        if (!isTodayValid)
            return null;
        if (isWithinTimeWindow(currentMinutes, startMinutes, endMinutes)) {
            return { id: schedule.id, newStatus: "RUNNING", last_started_at: now };
        }
        return null;
    }
    return null;
}
