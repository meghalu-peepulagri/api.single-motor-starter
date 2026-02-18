import { BRIDGE_AGENT_TRIGGERED } from "../constants/app-constants.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { BridgeService } from "../services/bridge/bridge-service.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";
function parseBridgeError(error) {
    if (error?.code === "ECONNREFUSED") {
        throw new BadRequestException("Bridge service is not reachable. Please ensure the bridge server is running.");
    }
    if (error?.code === "ETIMEDOUT" || error?.code === "ECONNABORTED") {
        throw new BadRequestException("Bridge service connection timed out. Please try again.");
    }
    if (error?.response) {
        const status = error.response.status;
        const msg = error.response.data?.message || error.response.statusText || "Bridge request failed";
        throw new BadRequestException(`Bridge error (${status}): ${msg}`);
    }
    if (error?.message?.includes("Timeout waiting for agent")) {
        throw new BadRequestException(error.message);
    }
    throw new BadRequestException(error?.message || "Bridge service request failed");
}
export class BridgeHandlers {
    triggerAndWaitHandler = async (c) => {
        try {
            const result = await BridgeService.triggerAndWait("e6546916-71eb-437b-a3a4-69866966f101");
            return sendResponse(c, 200, BRIDGE_AGENT_TRIGGERED, result);
        }
        catch (error) {
            logger.error("Error at bridge triggerAndWait :", error);
            console.error("Error at bridge triggerAndWait :", error);
            parseBridgeError(error);
            throw error;
        }
    };
}
