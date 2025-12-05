import { saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { getStarterByMacWithMotor } from "../services/db/starter-services.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";
export async function liveDataHandler(topic, parsedMessage) {
    try {
        if (!parsedMessage)
            return;
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        console.log('validMac: ', validMac);
        if (!validMac) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        // Validate and format the live data structure
        const formattedData = validateLiveDataFormat(parsedMessage, topic);
        if (!formattedData)
            return;
        // Validate the payload content
        const validatedData = validateLiveDataContent(formattedData);
        console.log('validatedData: ', validatedData);
        if (!validatedData)
            return;
        // Prepare the payload
        const preparedPayload = prepareLiveDataPayload(validatedData, validMac);
        console.log('preparedPayload: ', preparedPayload);
        if (!preparedPayload)
            return;
        await saveLiveDataTopic(preparedPayload, preparedPayload.group_id);
    }
    catch (error) {
        console.error("Error at live data topic handler:", error);
        throw error;
    }
}
