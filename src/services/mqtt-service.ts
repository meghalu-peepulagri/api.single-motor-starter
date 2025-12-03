import { MqttService } from "@core-services/mqtt";
import mqttConfig from "../config/mqtt-config.js";

const { clientId, brokerUrl, username, password } = mqttConfig;

const topics = ["test/+/live/45", "test2", "test3"];

export const mqttConnect = () => {
  const mqttServiceInstance = MqttService.getInstance(clientId, brokerUrl, username, password, () => { });
  mqttServiceInstance.connect(topics, true);

  mqttServiceInstance.handler("test/+/live/45", (message: any, topic: string) => {
    console.log("Received message:", message, "Topic:", topic);
  });
};
