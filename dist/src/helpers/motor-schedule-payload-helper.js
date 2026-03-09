import { randomSequenceNumber } from "./mqtt-helpers.js";
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
    const scheduleStartDate = normalizeDate(payload.schedule_start_date ?? payload.schedule_date ?? payload.date);
    const scheduleEndDate = normalizeDate(payload.schedule_end_date);
    const powerLossRecovery = to01(payload.power_loss_recovery ?? payload.pwr_rec);
    const enabled = to01(payload.en);
    const finalStartTime = startTime ?? payload.start_time;
    const finalEndTime = endTime ?? payload.end_time;
    const normalized = {
        ...payload,
        schedule_type: scheduleType,
        schedule_start_date: scheduleStartDate ?? payload.schedule_start_date,
        schedule_end_date: scheduleEndDate ?? payload.schedule_end_date ?? null,
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
// =================== COMPACT DEVICE SYNC PAYLOAD ===================
const MAX_PAYLOAD_BYTES = 800;
const MAX_PAYLOADS_PER_DEVICE = 6;
/** Format a single schedule record into compact device payload "D" object */
function toCompactSchedule(record) {
    const isCyclic = record.schedule_type === "CYCLIC";
    const days = record.bit_wise_days ?? 0;
    if (isCyclic) {
        return {
            sch_type: 2,
            id: record.schedule_id,
            start: record.start_time,
            end: record.end_time,
            on: record.cycle_on_minutes ?? 0,
            off: record.cycle_off_minutes ?? 0,
            rep: record.repeat ?? 0,
            days,
            en: record.enabled ? 1 : 0,
        };
    }
    return {
        sch_type: 1,
        id: record.schedule_id,
        start: record.start_time,
        end: record.end_time,
        dur: record.runtime_minutes ?? 0,
        rep: record.repeat ?? 0,
        days,
        pwr_rec: record.power_loss_recovery ? 1 : 0,
        en: record.enabled ? 1 : 0,
    };
}
/**
 * Build compact device sync payloads from schedule records.
 * Groups by starter_id, formats each schedule as compact "D" object,
 * splits into chunks of max 800 bytes, max 6 payloads per device.
 *
 * Returns: Array of { T: starter_id, S: schedule.id, D: {...} }[]
 * grouped per starter as chunks.
 */
export function buildDeviceSyncPayloads(records) {
    // Group schedules by starter_id
    const grouped = new Map();
    for (const record of records) {
        if (!record.starter_id)
            continue;
        const list = grouped.get(record.starter_id) || [];
        list.push(record);
        grouped.set(record.starter_id, list);
    }
    const result = [];
    for (const [starterId, schedules] of grouped) {
        // Build individual compact items
        const items = schedules.map((sch) => ({
            T: 23,
            S: randomSequenceNumber(),
            D: toCompactSchedule(sch),
        }));
        // Split into chunks that fit within MAX_PAYLOAD_BYTES
        const chunks = [];
        let currentChunk = [];
        let currentSize = 2; // for "[]"
        for (const item of items) {
            const itemSize = Buffer.byteLength(JSON.stringify(item), "utf8");
            const separatorSize = currentChunk.length > 0 ? 1 : 0; // comma
            if (currentSize + separatorSize + itemSize > MAX_PAYLOAD_BYTES && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [item];
                currentSize = 2 + itemSize;
            }
            else {
                currentChunk.push(item);
                currentSize += separatorSize + itemSize;
            }
        }
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        // Limit to MAX_PAYLOADS_PER_DEVICE chunks per device
        const limitedChunks = chunks.slice(0, MAX_PAYLOADS_PER_DEVICE);
        result.push({ starter_id: starterId, chunks: limitedChunks });
    }
    return result;
}
