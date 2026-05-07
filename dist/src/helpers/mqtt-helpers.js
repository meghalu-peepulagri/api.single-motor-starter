import { DEVICE_SCHEMA } from "../constants/app-constants.js";
import { getGatewayByIdentifier } from "../services/db/gateway-services.js";
import { insertParametersForUnmatchedMotor, saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { getStarterByMacWithMotor } from "../services/db/starter-services.js";
import { logger } from "../utils/logger.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { extractMultiMotorBlocks, isMultiMotorPayload, resolveMotorsFromPayload } from "./multi-motor-live-data-helper.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";
export async function liveDataHandler(parsedMessage, topic) {
    try {
        if (!parsedMessage)
            return;
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId) {
            logger.error("Invalid MQTT topic or missing device MAC", undefined, { gatewayId, deviceId, topic });
            return null;
        }
        // Always validate device MAC in DB
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device) {
            logger.error("Starter not found for MAC", undefined, { deviceId, topic });
            return null;
        }
        // For 4-segment topics (peepul/{gateway}/{device}/status): also validate gateway
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        const formatted = validateLiveDataFormat(parsedMessage, topic);
        if (!formatted)
            return null;
        if (device.starter_type === "MULTI_STARTER") {
            await handleMultiStarterLiveData(parsedMessage, formatted, device);
        }
        else {
            // SINGLE_STARTER — existing path, unchanged
            const validated = validateLiveDataContent(formatted);
            if (!validated)
                return null;
            const prepared = prepareLiveDataPayload(validated, device);
            if (!prepared)
                return null;
            await saveLiveDataTopic(prepared, prepared.group_id, device);
        }
    }
    catch (err) {
        logger.error("Error at live data topic handler", err);
        return null;
    }
}
async function handleMultiStarterLiveData(parsedMessage, formatted, device) {
    // Identify which group is present (G01 / G02 / G03 / G04)
    const groupKey = Object.keys(formatted.groups)[0];
    const rawGroupData = parsedMessage?.D?.[groupKey];
    // If the device is MULTI_STARTER but the payload has no m1/m2 keys (e.g. legacy firmware),
    // fall back to the single-motor path to stay backward-compatible.
    if (!isMultiMotorPayload(rawGroupData)) {
        const validated = validateLiveDataContent(formatted);
        if (!validated)
            return;
        const prepared = prepareLiveDataPayload(validated, device);
        if (!prepared)
            return;
        await saveLiveDataTopic(prepared, prepared.group_id, device);
        return;
    }
    // Extract per-motor blocks, merging shared group fields (p_v, pwr, llv) into each block
    const blocks = extractMultiMotorBlocks(rawGroupData);
    // Match each block to a DB motor via motor_reference
    const { matched, unmatched } = resolveMotorsFromPayload(blocks, device.motors);
    // Process each matched motor through the full pipeline (insert + motor state/mode updates)
    for (const { motorRef, motor, mergedData } of matched) {
        const syntheticPayload = {
            T: parsedMessage.T,
            S: parsedMessage.S,
            D: { [groupKey]: mergedData, ct: parsedMessage.D?.ct ?? null },
        };
        const validated = validateLiveDataContent({ original: syntheticPayload, groups: { [groupKey]: mergedData } });
        if (!validated) {
            logger.warn(`[MULTI_STARTER] Validation failed for motor_reference="${motorRef}" — skipping`, { mac: device.mac_address });
            continue;
        }
        const prepared = prepareLiveDataPayload(validated, device, motor);
        if (!prepared)
            continue;
        await saveLiveDataTopic(prepared, prepared.group_id, device);
    }
    // Process unmatched blocks — motor no longer assigned, insert parameters only (no motor/mode updates)
    for (const { motorRef, mergedData } of unmatched) {
        const syntheticPayload = {
            T: parsedMessage.T,
            S: parsedMessage.S,
            D: { [groupKey]: mergedData, ct: parsedMessage.D?.ct ?? null },
        };
        const validated = validateLiveDataContent({ original: syntheticPayload, groups: { [groupKey]: mergedData } });
        if (!validated) {
            logger.warn(`[MULTI_STARTER] Validation failed for unmatched motor_reference="${motorRef}" — skipping`, { mac: device.mac_address });
            continue;
        }
        await insertParametersForUnmatchedMotor(device, motorRef, validated);
    }
}
export function getIdentifiersFromTopic(topic) {
    const segments = topic.split("/");
    if (segments.length === 4) {
        // peepul/{gateway}/{device}/status
        return { gatewayId: segments[1], deviceId: segments[2] };
    }
    else if (segments.length === 3) {
        // peepul/{device}/status
        return { gatewayId: null, deviceId: segments[1] };
    }
    return { gatewayId: null, deviceId: null };
}
export function randomSequenceNumber() {
    let lastNumber = null;
    let random = 0;
    do {
        random = Math.floor(Math.random() * 256) + 1; // 1 to 256
    } while (random === lastNumber);
    lastNumber = random;
    return random;
}
;
export function removeEmptyObjectsDeep(obj) {
    if (obj === null || typeof obj !== "object")
        return obj;
    const result = Array.isArray(obj) ? [] : {};
    for (const key of Object.keys(obj)) {
        const value = removeEmptyObjectsDeep(obj[key]);
        if (value === undefined ||
            (typeof value === "object" &&
                value !== null &&
                Object.keys(value).length === 0)) {
            continue;
        }
        result[key] = value;
    }
    return result;
}
export function isEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
export function hasAnyChange(a, b) {
    if (a === b)
        return false;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
        return true;
    if (Array.isArray(a) || Array.isArray(b))
        return JSON.stringify(a) !== JSON.stringify(b);
    for (const key in b) {
        if (!(key in a))
            return true;
        const av = a[key];
        const bv = b[key];
        if (av === bv)
            continue;
        if (typeof av === "object" && typeof bv === "object") {
            if (hasAnyChange(av, bv))
                return true;
        }
        else {
            return true;
        }
    }
    return false;
}
export function mapFlatToCategoryPayload(flatData) {
    const result = {};
    for (const categoryKey of Object.keys(DEVICE_SCHEMA)) {
        const categorySchema = DEVICE_SCHEMA[categoryKey];
        const categoryData = {};
        for (const [fieldKey, fieldMap] of Object.entries(categorySchema)) {
            if (typeof fieldMap === "string") {
                if (flatData[fieldMap] !== undefined) {
                    categoryData[fieldKey] = flatData[fieldMap];
                }
            }
            else {
                // nested object (flt, alt, rec...)
                const nestedObj = {};
                for (const nestedKey of Object.keys(fieldMap)) {
                    if (flatData[nestedKey] !== undefined) {
                        nestedObj[nestedKey] = flatData[nestedKey];
                    }
                }
                if (Object.keys(nestedObj).length > 0) {
                    categoryData[fieldKey] = nestedObj;
                }
            }
        }
        if (Object.keys(categoryData).length > 0) {
            result[categoryKey] = categoryData;
        }
    }
    return result;
}
export function buildCategoryPayloadFromFlat(oldData, newData, DEVICE_SCHEMA) {
    const payload = {};
    const buildFullCategory = (map) => {
        const result = {};
        for (const key in map) {
            const mappedKey = map[key];
            if (typeof mappedKey === "string") {
                // take updated value if exists, else old value
                if (newData[mappedKey] !== undefined) {
                    result[key] = newData[mappedKey];
                }
                else {
                    result[key] = oldData[mappedKey];
                }
            }
            else {
                // nested object
                result[key] = buildFullCategory(mappedKey);
            }
        }
        return result;
    };
    const detectChange = (map) => {
        for (const key in map) {
            const mappedKey = map[key];
            if (typeof mappedKey === "string") {
                if (newData[mappedKey] !== undefined &&
                    !isEqual(newData[mappedKey], oldData[mappedKey])) {
                    return true;
                }
            }
            else {
                if (detectChange(mappedKey)) {
                    return true;
                }
            }
        }
        return false;
    };
    for (const category in DEVICE_SCHEMA) {
        const categoryMap = DEVICE_SCHEMA[category];
        // if ANY field inside category changed
        if (detectChange(categoryMap)) {
            payload[category] = buildFullCategory(categoryMap);
        }
    }
    return payload;
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const publishWithRetry = async (publishFn, options) => {
    const { attempts, delaysBeforeSendMs, ackTimeoutsMs } = options;
    // Validate retry options
    if (delaysBeforeSendMs.length !== attempts ||
        ackTimeoutsMs.length !== attempts) {
        throw new Error("Retry options arrays must match the number of attempts");
    }
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
        const attemptNumber = i + 1;
        try {
            // Delay before publish (skip if 0)
            if (delaysBeforeSendMs[i] > 0) {
                logger.mqtt(`Waiting ${delaysBeforeSendMs[i]}ms before attempt ${attemptNumber}`);
                await sleep(delaysBeforeSendMs[i]);
            }
            logger.mqtt(`Publishing attempt ${attemptNumber}/${attempts}`);
            // Publish message
            await publishFn();
            // If we reach here, publish succeeded
            logger.mqtt(`Publish attempt ${attemptNumber} succeeded`);
            return { success: true, attempts: attemptNumber };
        }
        catch (error) {
            lastError = error;
            logger.error(`Publish attempt ${attemptNumber}/${attempts} failed`, error);
            // If this is not the last attempt, continue to retry
            if (i < attempts - 1) {
                logger.mqtt(`Will retry... (${attempts - attemptNumber} attempts remaining)`);
            }
        }
    }
    // All retries exhausted
    logger.error(`All ${attempts} publish attempts failed`, lastError);
    return { success: false, attempts };
};
