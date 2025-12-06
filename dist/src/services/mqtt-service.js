import mqttConfig from "../config/mqtt-config.js";
import { liveDataHandler } from "../helpers/mqtt-helpers.js";
const { clientId, brokerUrl, username, password } = mqttConfig;
import mqtt from "mqtt";
import { findTopicACKByType } from "../helpers/packet-types-helper.js";
import { motorControlAckHandler, motorModeChangeAckHandler, selectTopicAck } from "./db/mqtt-db-services.js";
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
            console.error(message);
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
                "peepul/+/tele", "peepul/+/motor_control/ack", "peepul/+/mode_change/ack", "peepul/+/status"
            ]);
        });
        this.client.on("error", (error) => {
            console.error("MQTT connection error:", error.message);
        });
        this.client.on("reconnect", () => {
            console.warn("MQTT reconnecting...");
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
                    console.warn({ topic }, "Empty or invalid string message received. Skipping processing.");
                    return;
                }
                message = JSON.parse(message);
            }
            const parsedMessage = message;
            switch (true) {
                case /^peepul\/[^/]+\/tele$/.test(topic):
                    await liveDataHandler(topic, parsedMessage);
                    break;
                case /^peepul\/[^/]+\/motor_control\/ack$/.test(topic):
                    await motorControlAckHandler(parsedMessage, topic);
                    break;
                case /^peepul\/[^/]+\/mode_change\/ack$/.test(topic):
                    await motorModeChangeAckHandler(parsedMessage, topic);
                    break;
                case /^peepul\/[^/]+\/status$/.test(topic):
                    const topicType = findTopicACKByType(parsedMessage);
                    await selectTopicAck(topicType, message, topic);
                    break;
                default:
                    console.warn({ topic }, "No matching topic handler found.");
            }
        }
        catch (error) {
            console.error("Error while processing MQTT message:", error.message);
            throw error;
        }
    };
    publish = async (topic, message) => {
        try {
            if (!this.client?.connected) {
                console.error({ topic, message }, "MQTT client is not connected. Cannot publish.");
                return;
            }
            this.client.publish(topic, message, { qos: 1 }, (error) => {
                if (error) {
                    console.error(400, { topic, message }, `Error publishing message: ${error.message}`);
                }
            });
        }
        catch (error) {
            console.error(500, { topic, message, error: error.message, stack: error.stack }, "Error at publishing MQTT message", error.message);
            throw error;
        }
    };
    subscribe = async (topics) => {
        try {
            if (!this.client?.connected) {
                console.error(400, { topics }, "Cannot subscribe, MQTT client is not connected.");
                return;
            }
            const topicArray = Array.isArray(topics) ? topics : [topics];
            this.client.subscribe(topicArray, { qos: 1 }, (error, granted) => {
                if (error) {
                    console.error(400, { topics, error: error.message }, "Subscription error");
                }
                else if (granted?.length) {
                    granted.forEach(sub => console.log(`Subscribed to topic: ${sub.topic}`));
                }
                else {
                    console.error(400, { topics }, "No topics were granted during subscription");
                }
            });
        }
        catch (error) {
            console.error(500, { topics, error: error.message, stack: error.stack }, "Exception at subscribe mqtt", error.message);
            throw error;
        }
    };
    disconnect = async () => {
        try {
            if (!this.client?.connected) {
                console.error(400, {}, "MQTT client is not connected.");
                return;
            }
            this.client.end(() => {
                console.error(200, {}, "MQTT client disconnected");
            });
        }
        catch (error) {
            console.error(500, { error: error.message, stack: error.stack }, "Error at disconnecting MQTT client:", error.message);
            throw error;
        }
    };
}
// Create a single instance
export const mqttServiceInstance = new MqttService();
