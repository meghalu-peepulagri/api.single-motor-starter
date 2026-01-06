import { saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { getStarterByMacWithMotor } from "../services/db/starter-services.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";
export async function liveDataHandler(parsedMessage, topic) {
    try {
        if (!parsedMessage)
            return;
        const mac = typeof topic === "string" && topic.includes("/") ? topic.split("/")[1] : null;
        if (!mac) {
            console.error(`Invalid MQTT topic or missing MAC [${mac}]:`, topic);
            return null;
        }
        // Validate MAC in DB
        const validMac = await getStarterByMacWithMotor(mac);
        if (!validMac) {
            console.error(`Starter not found for MAC: ${mac}`, topic);
            return null;
        }
        // Format raw payload 
        const formatted = validateLiveDataFormat(parsedMessage, topic);
        if (!formatted)
            return null;
        // Validate live data content 
        const validated = validateLiveDataContent(formatted);
        if (!validated)
            return null;
        //  Prepare payload for DB 
        const prepared = prepareLiveDataPayload(validated, validMac);
        if (!prepared)
            return null;
        // Save final payload
        await saveLiveDataTopic(prepared, prepared.group_id, validMac);
    }
    catch (err) {
        console.error("Error at live data topic handler:", err);
        return null;
    }
}
export const randomSequenceNumber = () => {
    let lastNumber = null;
    let random = 0;
    do {
        random = Math.floor(Math.random() * 255) + 1; // 1 to 255
    } while (random === lastNumber);
    lastNumber = random;
    return random;
};
export function buildCategoryPayload(oldData, newData) {
    const payload = {};
    for (const category in newData) {
        if (!(category in oldData) || hasAnyChange(oldData[category], newData[category])) {
            payload[category] = newData[category];
        }
    }
    return payload;
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
