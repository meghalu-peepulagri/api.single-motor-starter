import { ALREADY_SCHEDULED_EXISTS, CYCLE_FIELDS_NOT_ALLOWED_FOR_ONE_TIME, CYCLE_ON_MINUTES_REQUIRED, CYCLIC_NO_POWER_LOSS_RECOVERY, CYCLIC_REQUIRES_REPEAT, ONE_TIME_REQUIRES_START_DATE, SCHEDULE_DATE_PAST, SCHEDULE_GAP_CONFLICT, SCHEDULE_MIN_ADVANCE, SCHEDULE_OVERLAP_CONFLICT, TIME_BASED_NO_REPEAT, } from "../constants/app-constants.js";
import { benchedStarterParameters } from "../database/schemas/benched-starter-parameters.js";
import { starterBoxParameters } from "../database/schemas/starter-parameters.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { motorState } from "./control-helpers.js";
import { meaningfulModeMessage } from "./activity-helper.js";
export function checkDuplicateMotorTitles(motors) {
    if (!Array.isArray(motors))
        return [];
    const titles = motors.map(m => (m?.name ?? "").toString().toLowerCase());
    const duplicateIndexes = [];
    for (let i = 0; i < titles.length; i++) {
        if (titles.indexOf(titles[i]) !== i) {
            duplicateIndexes.push(i);
        }
    }
    return duplicateIndexes;
}
export function motorFilters(query, user) {
    const whereQueryData = {
        columns: ["status"],
        relations: ["!="],
        values: ["ARCHIVED"],
    };
    if (query.search_string?.trim()) {
        const search = query.search_string.trim();
        whereQueryData.columns.push("name");
        whereQueryData.relations.push("contains");
        whereQueryData.values.push(search);
    }
    if (query.status) {
        whereQueryData.columns.push("status");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.status);
    }
    if (user.id && user.user_type !== "ADMIN" && user.user_type !== "SUPER_ADMIN") {
        whereQueryData.columns.push("created_by");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(user.id);
    }
    if (query.location_id) {
        whereQueryData.columns.push("location_id");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.location_id);
    }
    return whereQueryData;
}
export function buildAnalyticsFilter(parameter) {
    const selectedFieldsMain = {
        id: starterBoxParameters.id,
        time_stamp: starterBoxParameters.time_stamp,
    };
    const selectedFieldsBench = {
        id: benchedStarterParameters.id,
        time_stamp: benchedStarterParameters.time_stamp,
    };
    const voltageFieldsMain = {
        line_voltage_r: starterBoxParameters.line_voltage_r,
        line_voltage_y: starterBoxParameters.line_voltage_y,
        line_voltage_b: starterBoxParameters.line_voltage_b,
        avg_voltage: starterBoxParameters.avg_voltage,
    };
    const voltageFieldsBench = {
        line_voltage_r: benchedStarterParameters.line_voltage_r,
        line_voltage_y: benchedStarterParameters.line_voltage_y,
        line_voltage_b: benchedStarterParameters.line_voltage_b,
        avg_voltage: benchedStarterParameters.avg_voltage,
    };
    const currentFieldsMain = {
        current_r: starterBoxParameters.current_r,
        current_y: starterBoxParameters.current_y,
        current_b: starterBoxParameters.current_b,
        avg_current: starterBoxParameters.avg_current,
    };
    const currentFieldsBench = {
        current_r: benchedStarterParameters.current_r,
        current_y: benchedStarterParameters.current_y,
        current_b: benchedStarterParameters.current_b,
        avg_current: benchedStarterParameters.avg_current,
    };
    if (parameter === "voltage") {
        Object.assign(selectedFieldsMain, voltageFieldsMain);
        Object.assign(selectedFieldsBench, voltageFieldsBench);
    }
    else if (parameter === "current") {
        Object.assign(selectedFieldsMain, currentFieldsMain);
        Object.assign(selectedFieldsBench, currentFieldsBench);
    }
    else {
        Object.assign(selectedFieldsMain, voltageFieldsMain, currentFieldsMain);
        Object.assign(selectedFieldsBench, voltageFieldsBench, currentFieldsBench);
    }
    return {
        selectedFieldsMain,
        selectedFieldsBench,
    };
}
export function formatAnalyticsData(data, parameter) {
    return data.map(record => ({
        id: record.id,
        time_stamp: record.time_stamp,
        ...(parameter === "voltage"
            ? {
                line_voltage_r: Number.parseFloat((record.line_voltage_r || 0).toFixed(2)),
                line_voltage_y: Number.parseFloat((record.line_voltage_y || 0).toFixed(2)),
                line_voltage_b: Number.parseFloat((record.line_voltage_b || 0).toFixed(2)),
                avg_voltage: Number.parseFloat((record.avg_voltage || 0).toFixed(2)),
            }
            : {}),
        ...(parameter === "current"
            ? {
                current_r: Number.parseFloat((record.current_r || 0).toFixed(2)),
                current_y: Number.parseFloat((record.current_y || 0).toFixed(2)),
                current_b: Number.parseFloat((record.current_b || 0).toFixed(2)),
                avg_current: Number.parseFloat((record.avg_current || 0).toFixed(2)),
            }
            : {}),
        ...(!parameter
            ? {
                line_voltage_r: Number.parseFloat((record.line_voltage_r || 0).toFixed(2)),
                line_voltage_y: Number.parseFloat((record.line_voltage_y || 0).toFixed(2)),
                line_voltage_b: Number.parseFloat((record.line_voltage_b || 0).toFixed(2)),
                avg_voltage: Number.parseFloat((record.avg_voltage || 0).toFixed(2)),
                current_r: Number.parseFloat((record.current_r || 0).toFixed(2)),
                current_y: Number.parseFloat((record.current_y || 0).toFixed(2)),
                current_b: Number.parseFloat((record.current_b || 0).toFixed(2)),
                avg_current: Number.parseFloat((record.avg_current || 0).toFixed(2)),
            }
            : {}),
    }));
}
export function extractPreviousData(previousData, motorId) {
    const power = previousData?.power ?? null;
    const motor = previousData?.motors?.find((m) => m.id === motorId) || {};
    const prevState = motor.state;
    const prevMode = motor.mode ?? null;
    const locationId = motor.location_id ?? null;
    const created_by = motor.created_by ?? null;
    const device_created_by = previousData?.created_by;
    return { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number: previousData?.starter_number };
}
// =================== SCHEDULE TIME UTILITIES ===================
/** Convert "HH:mm" to total minutes from midnight */
export function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}
/**
 * Check if two time ranges overlap, accounting for midnight crossing.
 * Each range is [start, end) in "HH:mm" format.
 * Midnight crossing: start > end means the schedule wraps past midnight.
 */
export function doTimeRangesOverlap(startA, endA, startB, endB) {
    const sA = timeToMinutes(startA);
    const eA = timeToMinutes(endA);
    const sB = timeToMinutes(startB);
    const eB = timeToMinutes(endB);
    // Split midnight-crossing ranges into two segments
    const segmentsA = sA < eA
        ? [{ s: sA, e: eA }]
        : [{ s: sA, e: 1440 }, { s: 0, e: eA }];
    const segmentsB = sB < eB
        ? [{ s: sB, e: eB }]
        : [{ s: sB, e: 1440 }, { s: 0, e: eB }];
    for (const a of segmentsA) {
        for (const b of segmentsB) {
            if (a.s < b.e && b.s < a.e)
                return true;
        }
    }
    return false;
}
/**
 * Check if two time ranges are within `gapMinutes` of each other.
 * Returns true if the gap is LESS than gapMinutes (i.e., too close).
 */
export function areTimeRangesTooClose(startA, endA, startB, endB, gapMinutes = 5) {
    const sA = timeToMinutes(startA);
    const eA = timeToMinutes(endA);
    const sB = timeToMinutes(startB);
    const eB = timeToMinutes(endB);
    const segmentsA = sA < eA
        ? [{ s: sA, e: eA }]
        : [{ s: sA, e: 1440 }, { s: 0, e: eA }];
    const segmentsB = sB < eB
        ? [{ s: sB, e: eB }]
        : [{ s: sB, e: 1440 }, { s: 0, e: eB }];
    for (const a of segmentsA) {
        for (const b of segmentsB) {
            // Expand segment A by gapMinutes on both sides
            const expandedAS = Math.max(0, a.s - gapMinutes);
            const expandedAE = Math.min(1440, a.e + gapMinutes);
            if (expandedAS < b.e && b.s < expandedAE)
                return true;
        }
    }
    return false;
}
/**
 * Check if a new schedule's date/days actually overlap with an existing schedule.
 * - For one-time schedules (repeat=0): must share the same schedule_start_date
 * - For repeat schedules (repeat=1): must share at least one common day_of_week
 */
function hasDateOrDayOverlap(newSchedule, existing) {
    const isNewRepeat = (newSchedule.repeat ?? 0) === 1;
    if (isNewRepeat) {
        // Repeat schedule: conflict only if they share at least one common day
        const newDays = newSchedule.days_of_week || [];
        const existingDays = existing.days_of_week || [];
        if (newDays.length === 0 || existingDays.length === 0)
            return true; // no day info, assume conflict
        return newDays.some(d => existingDays.includes(d));
    }
    // One-time schedule: conflict only if same schedule_start_date
    const newDate = newSchedule.schedule_start_date;
    const existingDate = existing.schedule_start_date;
    if (!newDate || !existingDate)
        return true; // no date info, assume conflict
    return newDate === existingDate;
}
/**
 * Full conflict check against an array of existing schedules.
 * Checks date/day overlap first, then time overlaps and 5-minute gap violations.
 */
export function checkMotorScheduleConflict(newSchedule, existingSchedules) {
    if (!existingSchedules || existingSchedules.length === 0)
        return;
    for (const existing of existingSchedules) {
        // Skip if no date/day overlap
        if (!hasDateOrDayOverlap(newSchedule, existing))
            continue;
        const conflictInfo = {
            conflicting_schedule_id: existing.id,
            existing_start_time: existing.start_time,
            existing_end_time: existing.end_time,
            existing_date: existing.schedule_start_date || null,
            existing_days: existing.days_of_week || [],
        };
        // Check exact match
        if (newSchedule.start_time === existing.start_time && newSchedule.end_time === existing.end_time) {
            throw new ConflictException(`${ALREADY_SCHEDULED_EXISTS} (${existing.start_time} - ${existing.end_time})`, conflictInfo);
        }
        // Check direct overlap
        if (doTimeRangesOverlap(newSchedule.start_time, newSchedule.end_time, existing.start_time, existing.end_time)) {
            throw new ConflictException(`${SCHEDULE_OVERLAP_CONFLICT} (conflicts with ${existing.start_time} - ${existing.end_time})`, conflictInfo);
        }
        // Check 5-min gap
        if (areTimeRangesTooClose(newSchedule.start_time, newSchedule.end_time, existing.start_time, existing.end_time, 5)) {
            throw new ConflictException(`${SCHEDULE_GAP_CONFLICT} (too close to ${existing.start_time} - ${existing.end_time})`, conflictInfo);
        }
    }
}
/**
 * Validate that a schedule is created at least 5 minutes before its start_time.
 * For ONE_TIME schedules, also validates that schedule_date is not in the past.
 */
export function validateScheduleAdvanceTime(startTime, scheduleDate) {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    if (scheduleDate) {
        if (scheduleDate < todayStr) {
            throw new BadRequestException(SCHEDULE_DATE_PAST);
        }
        if (scheduleDate > todayStr) {
            return; // future date, no advance-time check needed
        }
    }
    // Schedule is for today — check 5-min advance
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(startTime);
    if (startMinutes - nowMinutes < 5) {
        throw new BadRequestException(SCHEDULE_MIN_ADVANCE);
    }
}
//prepare motor control notification
export function prepareMotorStateControlNotificationData(motor, newState, mode_description, starter_id, starter_number) {
    const pumpName = motor.alias_name === undefined || motor.alias_name === null ? starter_number : motor.alias_name;
    const title = newState === 1
        ? `Pump ${pumpName} state turned ON${mode_description ? ` with mode ${mode_description}` : ""}`
        : newState === 0
            ? `Pump ${pumpName} state turned OFF${mode_description ? ` with mode ${mode_description}` : ""}`
            : `Pump ${pumpName} state Unable to update due to: ${motorState(Number(newState))}`;
    // Prepare notification message
    let messageContent;
    if (newState === 1) {
        messageContent = mode_description === "AUTO"
            ? "The pump is now ON in AUTO mode after power recovery."
            : "The pump is running in MANUAL mode.";
    }
    else if (newState === 0) {
        messageContent = mode_description === "AUTO"
            ? "The pump is OFF in AUTO mode due to power failure."
            : "The pump is stopped in MANUAL mode.";
    }
    else {
        messageContent = `State not updated due to '${motorState(Number(newState))}'`;
    }
    // Check if user exists (allow 0 as valid user ID)
    if (motor.created_by !== null && motor.created_by !== undefined) {
        return {
            userId: motor.created_by,
            title: title,
            message: messageContent,
            motorId: motor.id,
            starterId: starter_id,
            starterNumber: starter_number,
        };
    }
    return null;
}
export function prepareMotorModeControlNotificationData(motor, mode_description, starter_id, starter_number) {
    const pumpName = motor.alias_name === undefined || motor.alias_name === null ? starter_number : motor.alias_name;
    const title = mode_description === "MANUAL" || mode_description === "AUTO" ? `Pump ${pumpName} mode updated to from ${motor.mode} to ${mode_description}`
        : `Pump ${pumpName} Mode not updated due to ${mode_description}`;
    // Prepare notification message
    const messageContent = meaningfulModeMessage(motor.mode, mode_description);
    // Check if user exists (allow 0 as valid user ID)
    if (motor.created_by !== null && motor.created_by !== undefined) {
        return {
            userId: motor.created_by,
            title: title,
            message: messageContent,
            motorId: motor.id,
            starterId: starter_id,
            starterNumber: starter_number,
        };
    }
    return null;
}
export function validateScheduleTypeRules(data) {
    const scheduleType = data.schedule_type || "TIME_BASED";
    if (scheduleType === "CYCLIC") {
        if (data.repeat !== 1)
            throw new BadRequestException(CYCLIC_REQUIRES_REPEAT);
        if (data.power_loss_recovery)
            throw new BadRequestException(CYCLIC_NO_POWER_LOSS_RECOVERY);
        if (!data.cycle_on_minutes || !data.cycle_off_minutes)
            throw new BadRequestException(CYCLE_ON_MINUTES_REQUIRED);
    }
    if (scheduleType === "TIME_BASED") {
        if (data.repeat === 1)
            throw new BadRequestException(TIME_BASED_NO_REPEAT);
        if (!data.schedule_start_date)
            throw new BadRequestException(ONE_TIME_REQUIRES_START_DATE);
        if (data.cycle_on_minutes || data.cycle_off_minutes)
            throw new BadRequestException(CYCLE_FIELDS_NOT_ALLOWED_FOR_ONE_TIME);
    }
}
