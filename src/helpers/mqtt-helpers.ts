import { saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { getStarterByMacWithMotor } from "../services/db/starter-services.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";

export async function liveDataHandler(parsedMessage: any, topic: string,) {
  try {

    if (!parsedMessage) return;

    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    if (!validMac) {
      console.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };
    // Validate and format the live data structure
    const formattedData = validateLiveDataFormat(parsedMessage, topic);
    if (!formattedData) return;

    // Validate the payload content
    const validatedData = validateLiveDataContent(formattedData);
    if (!validatedData) return;

    // Prepare the payload
    const preparedPayload = prepareLiveDataPayload(validatedData, validMac);
    if (!preparedPayload) return;

    await saveLiveDataTopic(preparedPayload, preparedPayload.group_id);
  }
  catch (error: any) {
    console.error("Error at live data topic handler:", error);
    throw error;
  }
}
