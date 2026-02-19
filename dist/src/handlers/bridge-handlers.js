import { BRIDGE_AGENT_TRIGGERED } from "../constants/app-constants.js";
import { BridgeService } from "../services/bridge/bridge-service.js";
import { sendResponse } from "../utils/send-response.js";
import { logger } from "../utils/logger.js";
export class BridgeHandlers {
    triggerAndWaitHandler = async (c) => {
        try {
            const result = await BridgeService.triggerAndWait("33cf8aff-a1c8-4d67-aaee-cf84dce21e3c");
            return sendResponse(c, 200, BRIDGE_AGENT_TRIGGERED, result);
        }
        catch (error) {
            logger.error("Error in triggerAndWaitHandler:", error);
            console.error("Error in triggerAndWaitHandler:", error);
            throw error;
        }
    };
}
