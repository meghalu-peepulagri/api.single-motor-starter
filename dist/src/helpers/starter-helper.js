import { eq, ne, sql } from "drizzle-orm";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { publishMultipleTimesInBackground } from "./settings-helpers.js";
import { sendUserNotification } from "../services/fcm/fcm-service.js";
import { getStartersWithSimRechargeExpiry } from "../services/db/starter-services.js";
export function prepareStarterData(starterBoxPayload, userPayload) {
    const motorDetails = {
        name: `Pump 1 - ${starterBoxPayload.pcb_number}`,
        hp: 2,
    };
    return { ...starterBoxPayload, status: "INACTIVE", device_status: "READY", created_by: userPayload.id, motorDetails };
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
export function parseSimExpiryDate(dateStr) {
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
    // Before expiry (positive diffDays)
    if (diffDays === 3) {
        return {
            title: `SIM Recharge Expiring Soon - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expires in 3 days (${expiryDateStr}). Please recharge soon.`,
        };
    }
    if (diffDays === 2) {
        return {
            title: `SIM Recharge Expiring Soon - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expires in 2 days (${expiryDateStr}). Please recharge soon.`,
        };
    }
    if (diffDays === 1) {
        return {
            title: `SIM Recharge Expiring Tomorrow - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expires tomorrow (${expiryDateStr}). Please recharge immediately.`,
        };
    }
    if (diffDays === 0) {
        return {
            title: `SIM Recharge Expires Today - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expires today (${expiryDateStr}). Please recharge immediately.`,
        };
    }
    // After expiry (negative diffDays)
    if (diffDays === -1) {
        return {
            title: `SIM Recharge Expired - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expired 1 day ago (${expiryDateStr}). Please recharge immediately.`,
        };
    }
    if (diffDays === -2) {
        return {
            title: `SIM Recharge Expired - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expired 2 days ago (${expiryDateStr}). Please recharge immediately.`,
        };
    }
    if (diffDays === -3) {
        return {
            title: `SIM Recharge Expired - ${deviceName}`,
            message: `Your SIM recharge for device ${deviceName} expired 3 days ago (${expiryDateStr}). Please recharge immediately.`,
        };
    }
    return null;
}
/** Check if diffDays falls within notification range (-3 to +3) */
export function isSimExpiryInNotificationRange(diffDays) {
    return diffDays >= -3 && diffDays <= 3;
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
async function sendDeviceInfoRequests(starters) {
    const deviceInfoPromises = starters.map((starter) => {
        const payload = { T: 10, S: randomSequenceNumber(), D: 1 };
        return publishMultipleTimesInBackground(payload, starter);
    });
    await Promise.allSettled(deviceInfoPromises);
}
export async function processSimRechargeExpiryNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const starters = await getStartersWithSimRechargeExpiry();
    // Collect all expired devices (day <= 0) for device info request
    const expiredStarters = [];
    const directNotify = [];
    for (const starter of starters) {
        if (!starter.sim_recharge_expires_at || !starter.created_by)
            continue;
        const diffDays = getExpiryDiffDays(starter.sim_recharge_expires_at, today);
        if (diffDays === null)
            continue;
        if (needsDeviceInfoRequest(diffDays)) {
            expiredStarters.push(starter);
        }
        else if (isSimExpiryInNotificationRange(diffDays)) {
            directNotify.push(starter);
        }
    }
    // Step 1: Notify pre-expiry devices directly (day 1, 2, 3)
    let notificationsSent = await sendExpiryNotifications(directNotify, today);
    // Step 2: Send device info request to ALL expired devices (day 0, -1, -2, ... -30, etc.)
    if (expiredStarters.length > 0) {
        await sendDeviceInfoRequests(expiredStarters);
        // Step 3: Re-read fresh data, notify only -3 to 0 range
        const freshStarters = await getStartersWithSimRechargeExpiry();
        const freshMap = new Map(freshStarters.map(s => [s.id, s]));
        const refreshedTargets = expiredStarters
            .map(s => freshMap.get(s.id))
            .filter((s) => !!s);
        notificationsSent += await sendExpiryNotifications(refreshedTargets, today);
    }
    return notificationsSent;
}
