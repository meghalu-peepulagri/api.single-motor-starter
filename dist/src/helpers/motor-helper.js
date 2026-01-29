import { ALREADY_SCHEDULED_EXISTS } from "../constants/app-constants.js";
import { benchedStarterParameters } from "../database/schemas/benched-starter-parameters.js";
import { starterBoxParameters } from "../database/schemas/starter-parameters.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { motorState } from "./control-helpers.js";
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
    if (user.id && user.user_type !== "ADMIN") {
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
    return { power, prevState, prevMode, locationId, created_by, motor };
}
export async function checkMotorScheduleConflict(validatedReqData, existingMotorSchedule) {
    if (!existingMotorSchedule)
        return;
    const newStart = validatedReqData.output.start_time;
    const newEnd = validatedReqData.output.end_time;
    const existStart = existingMotorSchedule.start_time;
    const existEnd = existingMotorSchedule.end_time;
    // Exact match
    if (newStart === existStart && newEnd === existEnd) {
        throw new ConflictException(ALREADY_SCHEDULED_EXISTS);
    }
    //  Overlap check (if times intersect at all)
    // The only case where there is NO conflict is when:
    const isOverlapping = !(newEnd <= existStart || newStart >= existEnd);
    if (isOverlapping) {
        throw new ConflictException("Schedule overlaps with an existing schedule");
    }
}
//prepare motor control notification
export function prepareMotorStateControlNotificationData(motor, newState, mode_description) {
    // Prepare notification message
    const messageContent = (newState === 0 || newState === 1)
        ? `Pump state updated to '${motorState(Number(newState))}' with mode '${mode_description}' successfully`
        : `Pump state not updated due to '${motorState(Number(newState))}'`;
    // Check if user exists (allow 0 as valid user ID)
    if (motor.created_by !== null && motor.created_by !== undefined) {
        return {
            userId: motor.created_by,
            title: "Pump State Update",
            message: messageContent,
            motorId: motor.id
        };
    }
    return null;
}
export function prepareMotorModeControlNotificationData(motor, mode_description) {
    // Prepare notification message
    const messageContent = (mode_description === "MANUAL" || mode_description === "AUTO")
        ? `Pump mode updated from '${motor.mode}' to '${mode_description}' successfully`
        : `Pump mode not updated due to '${mode_description}'`;
    // Check if user exists (allow 0 as valid user ID)
    if (motor.created_by !== null && motor.created_by !== undefined) {
        return {
            userId: motor.created_by,
            title: "Pump Mode Update",
            message: messageContent,
            motorId: motor.id
        };
    }
    return null;
}
