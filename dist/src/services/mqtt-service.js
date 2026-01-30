import mqttConfig from "../config/mqtt-config.js";
const { clientId, brokerUrl, username, password } = mqttConfig;
import mqtt from "mqtt";
import { findTopicACKByType } from "../helpers/packet-types-helper.js";
import { selectTopicAck } from "./db/mqtt-db-services.js";
import { logger } from "../utils/logger.js";
export class MqttService {
    client = null;
    clientId;
    connectUrl;
    username;
    password;
    constructor() {
        this.clientId = clientId ?? `Cloud-dev${Math.floor(Math.random() * 1000)}`;
        this.connectUrl = brokerUrl ?? "";
        this.username = username ?? "";
        this.password = password ?? "";
        const missing = [];
        if (!this.connectUrl)
            missing.push("MQTT Broker URL");
        if (!this.username)
            missing.push("MQTT username");
        if (!this.password)
            missing.push("MQTT password");
        if (missing.length > 0) {
            const message = `${missing.join(", ")} is missing in configuration`;
            logger.error(message);
        }
    }
    connect() {
        this.client = mqtt.connect(this.connectUrl, {
            clientId: this.clientId,
            clean: false,
            connectTimeout: 4000,
            username: this.username,
            password: this.password,
            reconnectPeriod: 1000,
        });
        this.client.on("connect", () => {
            this.subscribe([
                "peepul/+/status"
            ]);
        });
        this.client.on("error", (error) => {
            logger.error("MQTT connection error", error);
        });
        this.client.on("reconnect", () => {
            logger.warn("MQTT reconnecting...");
        });
        this.client.on("message", (topic, message) => {
            this.processMessage(topic, message);
        });
        return this.client;
    }
    processMessage = async (topic, message) => {
        try {
            if (Buffer.isBuffer(message)) {
                message = message.toString();
            }
            if (typeof message === "string") {
                if (message.length === 0 || !message.trim().startsWith("{")) {
                    logger.warn("Empty or invalid string message received. Skipping processing.", { topic });
                    return;
                }
                try {
                    message = JSON.parse(message);
                }
                catch (parseError) {
                    logger.error("JSON Parse Error: Malformed message received", { topic, messageSnippet: message.substring(0, 500) });
                    console.error("JSON Parse Error: Malformed message received", { topic, messageSnippet: message.substring(0, 500) });
                    return;
                }
            }
            const parsedMessage = message;
            switch (true) {
                case /^peepul\/[^/]+\/status$/.test(topic):
                    const topicType = findTopicACKByType(parsedMessage);
                    await selectTopicAck(topicType, message, topic);
                    break;
                default:
                    logger.warn("No matching topic handler found.", { topic });
            }
        }
        catch (error) {
            logger.error("Error while processing MQTT message", error);
            console.error("Error while processing MQTT message", error);
            throw error;
        }
    };
    publish = async (topic, message) => {
        try {
            if (!this.client?.connected) {
                logger.error("MQTT client is not connected. Cannot publish.", undefined, { topic, message });
                return;
            }
            this.client.publish(topic, message, { qos: 1 }, (error) => {
                if (error) {
                    logger.error("Error publishing message", error, { topic, message });
                }
            });
        }
        catch (error) {
            logger.error("Error at publishing MQTT message", error, { topic, message });
            throw error;
        }
    };
    subscribe = async (topics) => {
        try {
            if (!this.client?.connected) {
                logger.error("Cannot subscribe, MQTT client is not connected.", undefined, { topics });
                return;
            }
            const topicArray = Array.isArray(topics) ? topics : [topics];
            this.client.subscribe(topicArray, { qos: 1 }, (error, granted) => {
                if (error) {
                    logger.error("Subscription error", error, { topics });
                }
                else if (granted?.length) {
                    granted.forEach(sub => logger.mqtt(`Subscribed to topic: ${sub.topic}`));
                }
                else {
                    logger.error("No topics were granted during subscription", undefined, { topics });
                }
            });
        }
        catch (error) {
            logger.error("Exception at subscribe mqtt", error, { topics });
            throw error;
        }
    };
    disconnect = async () => {
        try {
            if (!this.client?.connected) {
                logger.error("MQTT client is not connected.");
                return;
            }
            this.client.end(() => {
                logger.mqtt("MQTT client disconnected");
            });
        }
        catch (error) {
            logger.error("Error at disconnecting MQTT client", error);
            throw error;
        }
    };
    getClient() {
        return this.client;
    }
}
// Create a single instance
export const mqttServiceInstance = new MqttService();
