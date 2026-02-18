import axios from "axios";
import bridgeConfig from "../../config/bridge-config.js";
import { logger } from "../../utils/logger.js";
const BRIDGE_URL = bridgeConfig.baseUrl;
const MAX_POLL_ATTEMPTS = 2;
const POLL_INTERVAL_MS = 1000;
export class BridgeService {
    //  Health Check
    static async healthCheck() {
        try {
            const response = await axios.get(`${BRIDGE_URL}/health`);
            if (!response.data.ok) {
                throw new Error("Bridge reported unhealthy status");
            }
            return response.data;
        }
        catch (error) {
            console.error("Bridge health check failed:", error);
            logger.info("Bridge health check failed:", error);
            throw error();
        }
    }
    // Trigger Agent
    static async triggerAgent(agentId) {
        try {
            const response = await axios.post(`${BRIDGE_URL}/api/read/${agentId}`);
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to trigger agent: ${error.message}`);
        }
    }
    //  Get Result
    static async getResult(requestId) {
        try {
            const response = await axios.get(`${BRIDGE_URL}/api/results/${requestId}`);
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch result: ${error.message}`);
        }
    }
    //  Trigger and Wait
    static async triggerAndWait(agentId) {
        // First check bridge health
        await this.healthCheck();
        const trigger = await this.triggerAgent(agentId);
        const requestId = trigger.requestId;
        for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
            const result = await this.getResult(requestId);
            if (result.ok !== null) {
                return result;
            }
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
        throw new Error(`Timeout waiting for agent response after ${MAX_POLL_ATTEMPTS} attempts`);
    }
}
