import { saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { getStarterByMacWithMotor } from "../services/db/starter-services.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";
export async function liveDataHandler(topic, parsedMessage) {
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
