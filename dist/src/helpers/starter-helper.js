import { eq, ne, sql } from "drizzle-orm";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
// Previously used for MQTT device info requests — topic no longer available after enhancement
// import { randomSequenceNumber } from "./mqtt-helpers.js";
// import { publishMultipleTimesInBackground } from "./settings-helpers.js";
import { sendUserNotification } from "../services/fcm/fcm-service.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { PAYLOAD_VERSION_DUAL_MOTOR_INVALID } from "../constants/app-constants.js";
import { getStartersWithSimRechargeExpiry } from "../services/db/starter-services.js";
export function prepareStarterData(starterBoxPayload, userPayload, dispatchDetails, gatewayId) {
    const { motors: motorsInput, ...starterFields } = starterBoxPayload;
    // One row per motor from the "Motors" section (M1, M2...), each with its own motor_index.
    // Fall back to the legacy single default motor when no motors are supplied.
    const motorsList = Array.isArray(motorsInput) && motorsInput.length > 0
        ? motorsInput.map((motor, index) => ({
            name: motor.name,
            hp: String(motor.hp),
            motor_index: index + 1,
            motor_reference: motor.motor_reference ?? null,
        }))
        : [{
                name: `Pump 1 - ${starterBoxPayload.pcb_number}`,
                hp: "2",
                motor_index: 1,
            }];
    // Single vs multiple motor drives motor_support_type; starter_type honors the payload value
    // when sent, otherwise falls back to the same single/multiple derivation.
    const isMultiMotor = motorsList.length > 1;
    const motor_support_type = isMultiMotor ? "MULTIPLE_MOTORS" : "SINGLE_MOTOR";
    const starter_type = starterFields.starter_type ?? (isMultiMotor ? "MULTI_STARTER" : "SINGLE_STARTER");
    // A dual-motor box has no 1.0 payload shape (nowhere to put m2), so it is always 2.0.
    // A single-motor box honours the Admin Panel's choice and defaults to 1.0 — the safe
    // assumption for a board whose firmware we haven't been told about.
    if (isMultiMotor && starterFields.payload_version === "1.0") {
        throw new BadRequestException(PAYLOAD_VERSION_DUAL_MOTOR_INVALID);
    }
    const payload_version = isMultiMotor ? "2.0" : (starterFields.payload_version ?? "1.0");
    return {
        ...starterFields, status: "INACTIVE", device_status: "READY", created_by: userPayload.id, motorsList, motor_support_type, starter_type, payload_version,
        sim_recharge_expires_at: dispatchDetails?.sim_recharge_end_date, warranty_expiry_date: dispatchDetails?.warranty_end_date,
        device_mobile_number: dispatchDetails?.sim_no ?? starterFields.device_mobile_number, hardware_version: dispatchDetails?.hardware_version, gateway_id: gatewayId
    };
}
;
export function starterFilters(query, user) {
    const filters = [];
    filters.push(ne(starterBoxes.status, "ARCHIVED"));
    if (query.search_string?.trim()) {
        const s = `%${query.search_string.trim()}%`;
        if (user.user_type === "ADMIN" || user.user_type === "SUPER_ADMIN") {
            filters.push(sql `(
          ${starterBoxes.pcb_number} ILIKE ${s}
          OR ${starterBoxes.starter_number} ILIKE ${s}
          OR ${starterBoxes.mac_address} ILIKE ${s}
        )`);
        }
        else {
            filters.push(sql `(
          ${starterBoxes.starter_number} ILIKE ${s} OR
          EXISTS (
            SELECT 1
            FROM ${motors} AS m
            WHERE m.starter_id = ${starterBoxes.id} 
              AND m.status <> 'ARCHIVED'
              AND m.alias_name ILIKE ${s}
          )
        )`);
        }
    }
    if (query.status)
        filters.push(eq(starterBoxes.status, query.status));
    if (query.location_id)
        filters.push(eq(starterBoxes.location_id, query.location_id));
    // Filter by motor type based on the ACTUAL number of (non-archived) motors, so it matches
    // what the UI renders (single toggle vs M1/M2) — not the motor_support_type column, which
    // can be out of sync with the real motor count.
    // ?motor_type=single -> exactly 1 motor, ?motor_type=dual -> 2 or more motors.
    if (query.motor_type) {
        const motorType = String(query.motor_type).trim().toLowerCase();
        const motorCount = sql `(
      SELECT COUNT(*) FROM ${motors} AS m
      WHERE m.starter_id = ${starterBoxes.id} AND m.status <> 'ARCHIVED'
    )`;
        if (motorType === "single") {
            filters.push(sql `${motorCount} = 1`);
        }
        else if (motorType === "dual" || motorType === "multiple" || motorType === "multi") {
            filters.push(sql `${motorCount} >= 2`);
        }
    }
    if (query.power) {
        const powerValue = query.power === "ON" ? 1 : query.power === "OFF" ? 0 : undefined;
        if (powerValue !== undefined) {
            filters.push(eq(starterBoxes.power, powerValue));
        }
    }
    if (query.device_status)
        filters.push(eq(starterBoxes.device_status, query.device_status));
    if (query.user_id)
        filters.push(eq(starterBoxes.user_id, query.user_id));
    if (user.user_type !== "ADMIN" && user.user_type !== "SUPER_ADMIN")
        filters.push(eq(starterBoxes.user_id, user.id));
    return filters;
}
export function starterCountFilters(query) {
    const filters = [];
    filters.push(ne(starterBoxes.status, "ARCHIVED"));
    if (query.search_string?.trim()) {
        const s = `%${query.search_string.trim()}%`;
        filters.push(sql `(
        ${starterBoxes.pcb_number} ILIKE ${s}
        OR ${starterBoxes.starter_number} ILIKE ${s}
        OR ${starterBoxes.mac_address} ILIKE ${s}
      )`);
    }
    if (query.user_id)
        filters.push(eq(starterBoxes.user_id, Number(query.user_id)));
    if (query.location_id)
        filters.push(eq(starterBoxes.location_id, Number(query.location_id)));
    if (query.status) {
        filters.push(eq(starterBoxes.status, query.status));
    }
    if (query.device_status) {
        filters.push(eq(starterBoxes.device_status, query.device_status));
    }
    if (query.power) {
        const powerValue = query.power === "ON" ? 1 : query.power === "OFF" ? 0 : undefined;
        if (powerValue !== undefined)
            filters.push(eq(starterBoxes.power, powerValue));
    }
    return filters;
}
export function parseSimExpiryDate(dateStr) {
    // DD-MM-YYYY format (e.g., "21-02-2027") — primary format from dispatch
    const ddmmyyyy = dateStr.trim().split("-");
    if (ddmmyyyy.length === 3) {
        const day = parseInt(ddmmyyyy[0], 10);
        const month = parseInt(ddmmyyyy[1], 10) - 1;
        const year = parseInt(ddmmyyyy[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) {
                parsed.setHours(0, 0, 0, 0);
                return parsed;
            }
        }
    }
    // Fallback: "day month year" format (e.g., "21 feb 2027") — for existing production data
    const monthMap = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const parts = dateStr.trim().split(/\s+/);
    const day = parseInt(parts[0], 10);
    const month = monthMap[parts[1]?.toLowerCase()];
    const year = parseInt(parts[2], 10);
    const parsed = (parts.length === 3 && !isNaN(day) && month !== undefined && !isNaN(year))
        ? new Date(year, month, day)
        : new Date(dateStr);
    if (isNaN(parsed.getTime()))
        return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
}
export function buildSimExpiryNotification(diffDays, deviceName, expiryDateStr) {
    // 15 days before expiry
    if (diffDays === 15) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expires on ${expiryDateStr}. 15 days remaining.`,
        };
    }
    // Before expiry (positive diffDays)
    if (diffDays === 3) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expires on ${expiryDateStr}. 3 days remaining.`,
        };
    }
    if (diffDays === 2) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expires on ${expiryDateStr}. 2 days remaining.`,
        };
    }
    if (diffDays === 1) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expires tomorrow (${expiryDateStr}). 1 day remaining.`,
        };
    }
    if (diffDays === 0) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expires today (${expiryDateStr}). Please recharge now.`,
        };
    }
    // After expiry (negative diffDays)
    if (diffDays === -1) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expired on ${expiryDateStr}. Overdue by 1 day.`,
        };
    }
    if (diffDays === -2) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expired on ${expiryDateStr}. Overdue by 2 days.`,
        };
    }
    if (diffDays === -3) {
        return {
            title: `🔔 Recharge Alert`,
            message: `${deviceName} - Recharge expired on ${expiryDateStr}. Overdue by 3 days.`,
        };
    }
    return null;
}
/** Check if diffDays falls within notification range (-3 to +3, or exactly 15) */
export function isSimExpiryInNotificationRange(diffDays) {
    return (diffDays >= -3 && diffDays <= 3) || diffDays === 15;
}
/** Check if device info request is needed (expiry day or any time past expiry) */
export function needsDeviceInfoRequest(diffDays) {
    return diffDays <= 0;
}
function getExpiryDiffDays(expiryDateStr, today) {
    const expiryDate = parseSimExpiryDate(expiryDateStr);
    if (!expiryDate)
        return null;
    return Math.round((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
async function sendExpiryNotifications(starters, today) {
    let count = 0;
    for (const starter of starters) {
        if (!starter.sim_recharge_expires_at || !starter.created_by)
            continue;
        const diffDays = getExpiryDiffDays(starter.sim_recharge_expires_at, today);
        if (diffDays === null || !isSimExpiryInNotificationRange(diffDays))
            continue;
        const deviceName = starter.motor_alias_name ?? starter.starter_number;
        const userId = starter.motor_created_by ?? starter.created_by;
        const notification = buildSimExpiryNotification(diffDays, deviceName ?? "", starter.sim_recharge_expires_at);
        if (notification && userId && starter.motor_id) {
            await sendUserNotification(userId, notification.title, notification.message, starter.motor_id, starter.id);
            count++;
        }
    }
    return count;
}
// Previously used to publish MQTT device info request topic for expired devices
// Topic is no longer available after enhancement — commented out
// async function sendDeviceInfoRequests(
//   starters: Awaited<ReturnType<typeof getStartersWithSimRechargeExpiry>>,
// ): Promise<void> {
//   const deviceInfoPromises = starters.map((starter) => {
//     const payload = { T: 10, S: randomSequenceNumber(), D: 1 };
//     return publishMultipleTimesInBackground(payload, starter as any);
//   });
//   await Promise.allSettled(deviceInfoPromises);
// }
export async function processSimRechargeExpiryNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const starters = await getStartersWithSimRechargeExpiry();
    // Send notifications for all starters in notification range (-3 to +3 days, and 15 days)
    const notificationsSent = await sendExpiryNotifications(starters, today);
    // Previously, device info requests were sent via MQTT topic for expired devices
    // Topic is no longer available after enhancement — publish logic removed
    // if (expiredStarters.length > 0) {
    //   await sendDeviceInfoRequests(expiredStarters);
    //   const freshStarters = await getStartersWithSimRechargeExpiry();
    //   const freshMap = new Map(freshStarters.map(s => [s.id, s]));
    //   const refreshedTargets = expiredStarters
    //     .map(s => freshMap.get(s.id))
    //     .filter((s): s is NonNullable<typeof s> => !!s);
    //   notificationsSent += await sendExpiryNotifications(refreshedTargets, today);
    // }
    return notificationsSent;
}
