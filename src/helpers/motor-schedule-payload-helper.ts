import { randomSequenceNumber } from "./mqtt-helpers.js";

type ScheduleType = "TIME_BASED" | "CYCLIC";

const VALID_SCHEDULE_TYPES: ScheduleType[] = ["TIME_BASED", "CYCLIC"];

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

function to01(value: unknown): 0 | 1 | undefined {
  if (value === true) return 1;
  if (value === false) return 0;
  const n = toInteger(value);
  if (n === 0 || n === 1) return n;
  return undefined;
}

function normalizeScheduleType(value: unknown): ScheduleType | undefined {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase().replace(/-/g, "_");
    if (VALID_SCHEDULE_TYPES.includes(normalized as ScheduleType)) {
      return normalized as ScheduleType;
    }
  }

  const numericType = toInteger(value);
  if (numericType === 1) return "TIME_BASED";
  if (numericType === 2) return "CYCLIC";
  return undefined;
}

/**
 * Normalize any time input to 4-digit zero-padded HHMM string.
 * Accepts: number 600, string "5", "25", "600", "0005", "06:00" → returns "0600", "0005" etc.
 */
export function normalizeTime(value: unknown): string | undefined {
  let h: number;
  let m: number;

  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2359) {
    h = Math.floor(value / 100);
    m = value % 100;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    // HH:MM format
    const colonMatch = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (colonMatch) {
      h = parseInt(colonMatch[1], 10);
      m = parseInt(colonMatch[2], 10);
    } else if (/^\d{1,4}$/.test(trimmed)) {
      // 1-4 digit string: pad to 4, split HHMM
      const padded = trimmed.padStart(4, "0");
      h = parseInt(padded.substring(0, 2), 10);
      m = parseInt(padded.substring(2, 4), 10);
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }

  if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
  return `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

function formatTimeFromMinutes(totalMinutes: number): string {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

export function addMinutesToTime(hhmm: string, minutesToAdd: number): string {
  const h = parseInt(hhmm.substring(0, 2), 10);
  const m = parseInt(hhmm.substring(2, 4), 10);
  return formatTimeFromMinutes((h * 60) + m + minutesToAdd);
}

function decodeDaysMask(mask: number): number[] {
  const days: number[] = [];
  for (let i = 0; i <= 6; i++) {
    if ((mask & (1 << i)) !== 0) {
      days.push(i);
    }
  }
  return days;
}

function normalizeDays(days: unknown): number[] | undefined {
  if (Array.isArray(days)) {
    const normalized = days
      .map((day) => toInteger(day))
      .filter((day): day is number => day !== undefined && day >= 0 && day <= 6);
    return [...new Set(normalized)].sort((a, b) => a - b);
  }

  const mask = toInteger(days);
  if (mask === undefined || mask < 0) return undefined;
  return decodeDaysMask(mask);
}

/**
 * Normalize any date input to numeric YYMMDD integer.
 * Accepts: number 260606, string "260606", "20260606", "2026-06-06" → returns 260606
 */
function normalizeDate(value: unknown): number | undefined {
  // Already numeric YYMMDD (e.g., 260606)
  if (typeof value === "number" && Number.isInteger(value)) {
    return validateAndReturnYYMMDD(value);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  // YYYY-MM-DD format → convert to numeric YYMMDD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const yy = parseInt(isoMatch[1], 10) - 2000;
    const mm = parseInt(isoMatch[2], 10);
    const dd = parseInt(isoMatch[3], 10);
    return validateAndReturnYYMMDD(yy * 10000 + mm * 100 + dd);
  }
  // String YYYYMMDD format (e.g., "20260606")
  if (/^\d{8}$/.test(trimmed)) {
    const yy = parseInt(trimmed.substring(0, 4), 10) - 2000;
    const mm = parseInt(trimmed.substring(4, 6), 10);
    const dd = parseInt(trimmed.substring(6, 8), 10);
    return validateAndReturnYYMMDD(yy * 10000 + mm * 100 + dd);
  }
  // String YYMMDD format (e.g., "260606")
  if (/^\d{6}$/.test(trimmed)) {
    return validateAndReturnYYMMDD(parseInt(trimmed, 10));
  }
  return undefined;
}

function validateAndReturnYYMMDD(value: number): number | undefined {
  const str = String(value).padStart(6, "0");
  if (str.length > 6) return undefined;
  const yy = parseInt(str.substring(0, 2), 10);
  const mm = parseInt(str.substring(2, 4), 10);
  const dd = parseInt(str.substring(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined;
  const yyyy = 2000 + yy;
  const dateObj = new Date(yyyy, mm - 1, dd);
  if (dateObj.getFullYear() !== yyyy || dateObj.getMonth() !== mm - 1 || dateObj.getDate() !== dd) return undefined;
  return value;
}

/** Convert numeric YYMMDD to "YYYY-MM-DD" string (for display/legacy) */
export function numericToDateString(value: number): string {
  const str = String(value).padStart(6, "0");
  const yy = parseInt(str.substring(0, 2), 10);
  const mm = str.substring(2, 4);
  const dd = str.substring(4, 6);
  return `${2000 + yy}-${mm}-${dd}`;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 in milliseconds

/** Convert a Date to IST and return { yy, mm, dd } */
function toISTDate(date: Date) {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    yy: istTime.getUTCFullYear() - 2000,
    mm: istTime.getUTCMonth() + 1,
    dd: istTime.getUTCDate(),
  };
}

/** Convert current IST date to numeric YYMMDD */
export function todayAsYYMMDD(): number {
  const { yy, mm, dd } = toISTDate(new Date());
  return yy * 10000 + mm * 100 + dd;
}

/** Convert a Date object to numeric YYMMDD (IST) */
export function dateToYYMMDD(date: Date): number {
  const { yy, mm, dd } = toISTDate(date);
  return yy * 10000 + mm * 100 + dd;
}

function inferScheduleType(payload: Record<string, any>): ScheduleType {
  // Accept cy: 1 = CYCLIC, cy: 0 or absent = TIME_BASED
  if (payload.cy === 1) return "CYCLIC";
  if (payload.cy === 0) return "TIME_BASED";

  const directType = normalizeScheduleType(payload.schedule_type) ?? normalizeScheduleType(payload.sch_type);
  if (directType) return directType;

  const inferredCyclic = payload.cycle_on_minutes !== undefined
    || payload.cycle_off_minutes !== undefined
    || payload.on !== undefined
    || payload.off !== undefined;

  return inferredCyclic ? "CYCLIC" : "TIME_BASED";
}

function normalizeSingleSchedulePayload(payload: Record<string, any>): Record<string, any> {
  const scheduleType = inferScheduleType(payload);
  const startTime = normalizeTime(payload.st ?? payload.start_time ?? payload.start);
  const runtimeMinutes = toInteger(payload.runtime_minutes ?? payload.dur);
  const rawEndInput = payload.et ?? payload.end_time ?? payload.end;
  const hasEndInput = !(
    rawEndInput === undefined
    || rawEndInput === null
    || (typeof rawEndInput === "string" && rawEndInput.trim() === "")
  );
  const explicitEnd = normalizeTime(rawEndInput);

  let endTime = explicitEnd;
  if (!hasEndInput && endTime === undefined && startTime !== undefined && runtimeMinutes !== undefined && runtimeMinutes > 0) {
    endTime = addMinutesToTime(startTime, runtimeMinutes);
  }
  if (!hasEndInput && endTime === undefined && scheduleType === "CYCLIC") {
    endTime = "2359";
  }

  const cycleOnMinutes = toInteger(payload.cycle_on_minutes ?? payload.on);
  const cycleOffMinutes = toInteger(payload.cycle_off_minutes ?? payload.off);
  const rawRepeat = payload.repeat ?? payload.rep;
  const hasRepeatInput = !(
    rawRepeat === undefined
    || rawRepeat === null
    || (typeof rawRepeat === "string" && rawRepeat.trim() === "")
  );
  const repeatRaw = toInteger(rawRepeat);
  const repeat = repeatRaw === 0 || repeatRaw === 1 ? repeatRaw : undefined;
  const daysOfWeek = normalizeDays(payload.days_of_week ?? payload.days) ?? [];
  const scheduleStartDate = normalizeDate(payload.sd ?? payload.schedule_start_date ?? payload.schedule_date ?? payload.date);
  const scheduleEndDate = normalizeDate(payload.ed ?? payload.schedule_end_date);

  const powerLossRecovery = to01(payload.power_loss_recovery ?? payload.pwr_rec);
  const enabled = to01(payload.en);

  const finalStartTime = startTime ?? payload.start_time;
  const finalEndTime = hasEndInput ? (explicitEnd ?? rawEndInput) : (endTime ?? payload.end_time);

  const normalized: Record<string, any> = {
    ...payload,
    schedule_type: scheduleType,
    schedule_start_date: scheduleStartDate ?? payload.schedule_start_date,
    schedule_end_date: scheduleEndDate ?? payload.schedule_end_date ?? null,
    start_time: finalStartTime,
    end_time: finalEndTime,
    repeat: hasRepeatInput ? (repeat ?? rawRepeat) : 0,
    cycle_on_minutes: cycleOnMinutes ?? payload.cycle_on_minutes,
    cycle_off_minutes: cycleOffMinutes ?? payload.cycle_off_minutes,
    days_of_week: daysOfWeek,
  };

  // power_loss_recovery: keep explicit input for validation; default CYCLIC to false only if not provided
  if (powerLossRecovery !== undefined) {
    normalized.power_loss_recovery = powerLossRecovery === 1;
  } else if (scheduleType === "CYCLIC") {
    normalized.power_loss_recovery = false;
  }

  if (enabled !== undefined && normalized.schedule_status === undefined) {
    normalized.schedule_status = enabled === 1 ? "PENDING" : "PAUSED";
  }

  return normalized;
}

export function normalizeMotorSchedulePayload(payload: any): any {
  if (Array.isArray(payload)) {
    return payload.map((item) => (isObject(item) ? normalizeSingleSchedulePayload(item) : item));
  }

  if (!isObject(payload)) return payload;
  return normalizeSingleSchedulePayload(payload);
}

export function normalizeRepeatDaysPayload(payload: any): any {
  if (!isObject(payload)) return payload;

  const daysOfWeek = normalizeDays(payload.days_of_week ?? payload.days);
  if (!daysOfWeek) return payload;

  return {
    ...payload,
    days_of_week: daysOfWeek,
  };
}

/**
 * Build the shared schedule fields used by both create and edit handlers.
 */
export function buildScheduleData(data: {
  motor_id: number;
  starter_id?: number | null;
  schedule_type?: string;
  schedule_start_date?: number | null;
  schedule_end_date?: number | null;
  start_time: string;
  end_time: string;
  days_of_week?: number[];
  bit_wise_days?: number;
  runtime_minutes?: number | null;
  cycle_on_minutes?: number | null;
  cycle_off_minutes?: number | null;
  power_loss_recovery?: boolean;
  repeat?: number;
  power_loss_recovery_time?: number;
}, scheduleStartDate: number) {
  const scheduleType: ScheduleType = (data.schedule_type as ScheduleType) || "TIME_BASED";
  return {
    motor_id: data.motor_id,
    starter_id: data.starter_id || null,
    schedule_type: scheduleType,
    schedule_start_date: scheduleStartDate,
    schedule_end_date: data.schedule_end_date || null,
    start_time: data.start_time,
    end_time: data.end_time,
    days_of_week: data.days_of_week || [],
    bit_wise_days: data.bit_wise_days ?? 0,
    runtime_minutes: data.runtime_minutes || null,
    cycle_on_minutes: scheduleType === "CYCLIC" ? data.cycle_on_minutes : null,
    cycle_off_minutes: scheduleType === "CYCLIC" ? data.cycle_off_minutes : null,
    power_loss_recovery: scheduleType === "CYCLIC" ? false : (data.power_loss_recovery === true),
    repeat: data.repeat ?? 0,
    power_loss_recovery_time: data.power_loss_recovery_time ?? 30,
  };
}

export function formatMotorScheduleResponse(record: any, queryDate?: number): any {
  if (!record || typeof record !== "object") return record;

  const { schedule_mode, repeat_type, ...rest } = record;
  const scheduleType = normalizeScheduleType(rest.schedule_type) ?? rest.schedule_type;

  // Compute display status based on queried date vs today
  let displayStatus = rest.schedule_status;
  if (queryDate) {
    const today = todayAsYYMMDD();
    if (queryDate > today && (displayStatus === "RUNNING" || displayStatus === "WAITING_NEXT_CYCLE")) {
      displayStatus = "SCHEDULED";
    }
  }

  return {
    ...rest,
    schedule_type: scheduleType,
    schedule_status: displayStatus,
    days_of_week: Array.isArray(rest.days_of_week) ? rest.days_of_week : [],
    start_time: rest.actual_start_time ?? rest.start_time,
    end_time: rest.actual_end_time ?? rest.end_time,
    runtime_minutes: rest.actual_run_time ?? rest.runtime_minutes,
  };
}

export function formatMotorScheduleListResponse(result: any, queryDate?: number): any {
  if (!result || typeof result !== "object") return result;
  if (!Array.isArray(result.records)) return result;

  return {
    ...result,
    records: result.records.map((record: any) => formatMotorScheduleResponse(record, queryDate)),
  };
}

// =================== COMPACT DEVICE SYNC PAYLOAD ===================

const MAX_SCHEDULES_PER_DEVICE = 12;
const MAX_ITEMS_PER_CHUNK = 8;

/** Format a single schedule record into compact m1 item based on schedule type */
function toCompactSchedule(record: any): Record<string, any> | null {
  // Skip schedules without valid start date
  if (!record.schedule_start_date) return null;

  const isCyclic = record.schedule_type === "CYCLIC";

  // TIME_BASED format: {id, sd, ed, st, et, en, pwr_rec}
  const item: Record<string, any> = {
    id: record.schedule_id,
    sd: record.schedule_start_date,
    ed: record.schedule_end_date ?? record.schedule_start_date,
    st: parseInt(record.start_time, 10),
    et: parseInt(record.end_time, 10),
    en: record.enabled ? 1 : 0,
    pwr_rec: record.power_loss_recovery ? 1 : 0,
  };

  // CYCLIC format adds: {cy, on, off}
  if (isCyclic) {
    item.cy = 1;
    item.on = record.cycle_on_minutes ?? 0;
    item.off = record.cycle_off_minutes ?? 0;
  }

  return item;
}

/**
 * Build compact device sync payloads from schedule records.
 * Groups by starter_id, takes first 10 schedules per device,
 * splits into chunks of max 8 items each.
 *
 * Each chunk is a single payload object:
 * { T: "SCHEDULE CREATION", S: seq, D: { idx, last, sch_cnt, plr, m1: [...] } }
 */
export function buildDeviceSyncPayloads(records: any[]): { starter_id: number; chunks: { payload: any; dbIds: number[] }[] }[] {
  // Group schedules by starter_id
  const grouped = new Map<number, any[]>();
  for (const record of records) {
    if (!record.starter_id) continue;
    const list = grouped.get(record.starter_id) || [];
    list.push(record);
    grouped.set(record.starter_id, list);
  }

  const result: { starter_id: number; chunks: { payload: any; dbIds: number[] }[] }[] = [];

  for (const [starterId, schedules] of grouped) {
    // Limit to first MAX_SCHEDULES_PER_DEVICE schedules per device, skip invalid
    const limited = schedules.slice(0, MAX_SCHEDULES_PER_DEVICE);
    const compactPairs = limited
      .map((r: any) => ({ record: r, compact: toCompactSchedule(r) }))
      .filter((p): p is { record: any; compact: Record<string, any> } => p.compact !== null);
    const compactItems = compactPairs.map(p => p.compact);
    const validRecords = compactPairs.map(p => p.record);
    // sch_cnt = total valid schedules being sent to this device in this sync call
    const totalCount = compactItems.length;

    if (compactItems.length === 0) continue;

    // Get plr from the first valid schedule (default 30)
    const plr = validRecords[0]?.power_loss_recovery_time ?? 30;

    // Split into chunks of MAX_ITEMS_PER_CHUNK
    const chunks: { payload: any; dbIds: number[] }[] = [];
    for (let i = 0; i < compactItems.length; i += MAX_ITEMS_PER_CHUNK) {
      const slice = compactItems.slice(i, i + MAX_ITEMS_PER_CHUNK);
      const dbIds = validRecords.slice(i, i + MAX_ITEMS_PER_CHUNK).map((r: any) => r.id);
      const chunkIdx = chunks.length + 1;
      const isLast = (i + MAX_ITEMS_PER_CHUNK) >= compactItems.length ? 1 : 0;

      chunks.push({
        payload: {
          T: 3,
          S: randomSequenceNumber(),
          D: {
            idx: chunkIdx,
            last: isLast,
            sch_cnt: totalCount,
            plr,
            m1: slice,
          },
        },
        dbIds,
      });
    }

    result.push({ starter_id: starterId, chunks });
  }

  return result;
}
