const VALID_SCHEDULE_TYPES = ["TIME_BASED", "CYCLIC"];
function isObject(value) {
    return typeof value === "object" && value !== null;
}
function toInteger(value) {
    if (typeof value === "number" && Number.isInteger(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isInteger(parsed))
            return parsed;
    }
    return undefined;
}
function to01(value) {
    if (value === true)
        return 1;
    if (value === false)
        return 0;
    const n = toInteger(value);
    if (n === 0 || n === 1)
        return n;
    return undefined;
}
function normalizeScheduleType(value) {
    if (typeof value === "string") {
        const normalized = value.trim().toUpperCase().replace(/-/g, "_");
        if (VALID_SCHEDULE_TYPES.includes(normalized)) {
            return normalized;
        }
    }
    const numericType = toInteger(value);
    if (numericType === 1)
        return "TIME_BASED";
    if (numericType === 2)
        return "CYCLIC";
    return undefined;
}
function normalizeTime(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed))
        return undefined;
    return trimmed;
}
function formatTimeFromMinutes(totalMinutes) {
    const minutesInDay = 24 * 60;
    const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function addMinutesToTime(time, minutesToAdd) {
    const [h, m] = time.split(":").map(Number);
    return formatTimeFromMinutes((h * 60) + m + minutesToAdd);
}
function decodeDaysMask(mask) {
    const days = [];
    for (let i = 0; i <= 6; i++) {
        if ((mask & (1 << i)) !== 0) {
            days.push(i);
        }
    }
    return days;
}
function normalizeDays(days) {
    if (Array.isArray(days)) {
        const normalized = days
            .map((day) => toInteger(day))
            .filter((day) => day !== undefined && day >= 0 && day <= 6);
        return [...new Set(normalized)].sort((a, b) => a - b);
    }
    const mask = toInteger(days);
    if (mask === undefined || mask < 0)
        return undefined;
    return decodeDaysMask(mask);
}
function normalizeDate(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
        return undefined;
    return trimmed;
}
function inferScheduleType(payload) {
    const directType = normalizeScheduleType(payload.schedule_type) ?? normalizeScheduleType(payload.sch_type);
    if (directType)
        return directType;
    const inferredCyclic = payload.cycle_on_minutes !== undefined
        || payload.cycle_off_minutes !== undefined
        || payload.on !== undefined
        || payload.off !== undefined;
    return inferredCyclic ? "CYCLIC" : "TIME_BASED";
}
function normalizeSingleSchedulePayload(payload) {
    const scheduleType = inferScheduleType(payload);
    const startTime = normalizeTime(payload.start_time ?? payload.start);
    const runtimeMinutes = toInteger(payload.runtime_minutes ?? payload.dur);
    const explicitEnd = normalizeTime(payload.end_time ?? payload.end);
    let endTime = explicitEnd;
    if (!endTime && startTime && runtimeMinutes !== undefined && runtimeMinutes > 0) {
        endTime = addMinutesToTime(startTime, runtimeMinutes);
    }
    if (!endTime && scheduleType === "CYCLIC") {
        endTime = "23:59";
    }
    const cycleOnMinutes = toInteger(payload.cycle_on_minutes ?? payload.on);
    const cycleOffMinutes = toInteger(payload.cycle_off_minutes ?? payload.off);
    const daysOfWeek = normalizeDays(payload.days_of_week ?? payload.days) ?? [];
    const scheduleDate = normalizeDate(payload.schedule_date ?? payload.date);
    const powerLossRecovery = to01(payload.power_loss_recovery ?? payload.pwr_rec);
    const enabled = to01(payload.en);
    const finalStartTime = startTime ?? payload.start_time;
    const finalEndTime = endTime ?? payload.end_time;
    const normalized = {
        ...payload,
        schedule_type: scheduleType,
        schedule_date: scheduleDate ?? payload.schedule_date,
        start_time: finalStartTime,
        end_time: finalEndTime,
        cycle_on_minutes: cycleOnMinutes ?? payload.cycle_on_minutes,
        cycle_off_minutes: cycleOffMinutes ?? payload.cycle_off_minutes,
        days_of_week: daysOfWeek,
    };
    if (powerLossRecovery !== undefined) {
        normalized.power_loss_recovery = powerLossRecovery === 1;
    }
    if (enabled !== undefined && normalized.schedule_status === undefined) {
        normalized.schedule_status = enabled === 1 ? "PENDING" : "PAUSED";
    }
    return normalized;
}
export function normalizeMotorSchedulePayload(payload) {
    if (Array.isArray(payload)) {
        return payload.map((item) => (isObject(item) ? normalizeSingleSchedulePayload(item) : item));
    }
    if (!isObject(payload))
        return payload;
    return normalizeSingleSchedulePayload(payload);
}
export function normalizeRepeatDaysPayload(payload) {
    if (!isObject(payload))
        return payload;
    const daysOfWeek = normalizeDays(payload.days_of_week ?? payload.days);
    if (!daysOfWeek)
        return payload;
    return {
        ...payload,
        days_of_week: daysOfWeek,
    };
}
export function formatMotorScheduleResponse(record) {
    if (!record || typeof record !== "object")
        return record;
    const { schedule_mode, repeat_type, ...rest } = record;
    const scheduleType = normalizeScheduleType(rest.schedule_type) ?? rest.schedule_type;
    return {
        ...rest,
        schedule_type: scheduleType,
        days_of_week: Array.isArray(rest.days_of_week) ? rest.days_of_week : [],
    };
}
export function formatMotorScheduleListResponse(result) {
    if (!result || typeof result !== "object")
        return result;
    if (!Array.isArray(result.records))
        return result;
    return {
        ...result,
        records: result.records.map((record) => formatMotorScheduleResponse(record)),
    };
}
