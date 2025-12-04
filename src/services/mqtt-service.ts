import { MqttService } from "@core-services/mqtt";
import mqttConfig from "../config/mqtt-config.js";
import { validateLiveDataFormat, validateLiveDataPayload } from "../helpers/live-topic-helpers.js";
import { prepareLiveDataPayload } from "../helpers/prepare-live-data-payload-helper.js";

const { clientId, brokerUrl, username, password } = mqttConfig;

const topics = ["peepul/+/live_data", "test2", "test3"];

export const mqttConnect = () => {
  try {
    const mqttServiceInstance = MqttService.getInstance(clientId, brokerUrl, username, password, () => { });
    mqttServiceInstance.connect(topics, true);

    mqttServiceInstance.handler("peepul/+/live_data", (message: any, topic: string) => {
      try {
        const parsedMessage: any = (() => {
          if (Buffer.isBuffer(message)) message = message.toString();

          if (typeof message === "string") {
            if (!message.trim()) return null;
            try {
              return JSON.parse(message);
            } catch {
              console.warn({ topic }, "Invalid JSON string received. Skipping processing.");
              return null;
            }
          }

          if (typeof message === "object" && message !== null) return message;
          console.warn({ topic }, "Unsupported message type. Skipping processing.", message);
          return null;
        })();

        if (!parsedMessage) return;

        // Validate and format the live data structure
        const formattedData = validateLiveDataFormat(parsedMessage, topic);
        if (!formattedData) return;

        // Validate the payload content
        const validatedData = validateLiveDataPayload(formattedData.matchedGroups, formattedData.payload,);
        if (!validatedData) return;

        const preparedPayload = prepareLiveDataPayload(validatedData);
        console.log('preparedPayload: ', preparedPayload);
      } catch (error: any) {
        console.error("Error at live data topic handler:", error);
        throw error;
      }
    });

  } catch (error: any) {
    console.error("Error at mqtt connect:", error);
    throw error;
  }
};
