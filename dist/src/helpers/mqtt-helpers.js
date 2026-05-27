import { DEVICE_SCHEMA } from "../constants/app-constants.js";
import { insertParametersForUnmatchedMotor, saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { findChildOfMasterByIdentifier, findMasterByIdentifier, getStarterByMacWithMotor } from "../services/db/starter-services.js";
import { logger } from "../utils/logger.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { extractMultiMotorBlocks, isMultiMotorPayload, resolveMotorsFromPayload } from "./multi-motor-live-data-helper.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";
export async function liveDataHandler(parsedMessage, topic) {
    console.log('topic: ', topic);
    console.log('parsedMessage: ', parsedMessage);
    try {
        if (!parsedMessage)
            return;
        const { masterId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId) {
            logger.error("Invalid MQTT topic or missing device MAC", undefined, { masterId, deviceId, topic });
            return null;
        }
        // Always validate device MAC in DB
        const device = await getStarterByMacWithMotor(deviceId);
        console.log('device: ', device);
        if (!device) {
            logger.error("Starter not found for MAC", undefined, { deviceId, topic });
            return null;
        }
        // For 4-segment topics (peepul/{master}/{device}/status): validate against
        // the MASTER/CHILD topology. segment[1] must resolve to a MASTER; segment[2]
        // must be either that master itself or a CHILD parented by it.
        if (masterId && deviceId) {
            const resolved = await resolveMasterChildFromTopic(topic);
            if (!resolved) {
                logger.error(`Master/child resolution failed for topic [${topic}]`, undefined, { masterId, deviceId, topic });
                return null;
            }
            if (resolved.deviceId !== device.id) {
                logger.error(`Master/child and device mapping mismatch for topic [${topic}]`, undefined, {
                    resolvedDeviceId: resolved.deviceId,
                    deviceId: device.id,
                    topic,
                });
                return null;
            }
        }
        const formatted = validateLiveDataFormat(parsedMessage, topic);
        if (!formatted)
            return null;
        const groupKey = Object.keys(formatted.groups)[0];
        const rawGroupData = parsedMessage?.D?.[groupKey];
        const isMultiStarter = device.motor_support_type === "MULTIPLE_MOTORS" || device.starter_type === "MULTI_STARTER";
        if (isMultiStarter && isMultiMotorPayload(rawGroupData)) {
            await handleMultiStarterLiveData(parsedMessage, formatted, device);
            return;
        }
        const validated = validateLiveDataContent(formatted);
        if (!validated)
            return null;
        const prepared = prepareLiveDataPayload(validated, device);
        if (!prepared)
            return null;
        await saveLiveDataTopic(prepared, prepared.group_id, device);
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
        // peepul/{master}/{device}/status
        return { masterId: segments[1], deviceId: segments[2] };
    }
    else if (segments.length === 3) {
        // peepul/{device}/status
        return { gatewayId: null, deviceId: segments[1] };
    }
    return { gatewayId: null, deviceId: null };
}
/**
 * Resolve an MQTT topic against the master/child topology.
 *
 * Expected topic shape (4 segments):
 *   peepul/{master_identifier}/{device_identifier}/{suffix}
 *
 * Identifiers are matched (case-insensitive) against `mac_address` or `pcb_number`.
 * (starter_number is intentionally NOT used here.)
 *
 *   - segment[1] MUST resolve to a MASTER row (role=MASTER, not archived).
 *   - segment[2] resolves to either:
 *       (a) the same master row itself          → kind="MASTER_SELF"
 *       (b) a CHILD whose parent_starter_id     → kind="CHILD_VIA_MASTER"
 *           equals the master's id
 *
 * Returns null on any miss (unknown master / unknown device / wrong parent /
 * not-a-child role). Caller should log and drop the packet on null.
 *
 * NOTE: this is a NEW resolver. The legacy `getIdentifiersFromTopic` and the
 * gateway-based callers in mqtt-db-services.ts are untouched.
 */
export async function resolveMasterChildFromTopic(topic) {
    const segments = topic.split("/");
    if (segments.length !== 4) {
        logger.warn("[resolveMasterChildFromTopic] expected 4-segment topic", { topic });
        return null;
    }
    const seg1 = segments[1];
    const seg2 = segments[2];
    if (!seg1 || !seg2) {
        logger.warn("[resolveMasterChildFromTopic] empty identifier segment", { topic });
        return null;
    }
    // Step 1 — resolve master
    const master = await findMasterByIdentifier(seg1);
    if (!master) {
        logger.warn("[resolveMasterChildFromTopic] unknown master identifier", { topic, seg1 });
        return null;
    }
    // Step 2a — does segment 2 point at the master itself? (compare mac & pcb only)
    const seg2Upper = seg2.trim().toUpperCase();
    const masterMac = master.mac_address?.toUpperCase() ?? null;
    const masterPcb = master.pcb_number?.toUpperCase() ?? null;
    if (seg2Upper === masterMac || seg2Upper === masterPcb) {
        return { deviceId: master.id, masterId: master.id, kind: "MASTER_SELF" };
    }
    // Step 2b — must be a CHILD of THIS master
    const child = await findChildOfMasterByIdentifier(master.id, seg2);
    if (!child) {
        logger.warn("[resolveMasterChildFromTopic] segment 2 is not the master itself nor a child of this master", { topic, masterId: master.id, seg2 });
        return null;
    }
    return { deviceId: child.id, masterId: master.id, kind: "CHILD_VIA_MASTER" };
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
