import type { Context } from "hono";
import { BRIDGE_AGENT_TRIGGERED } from "../constants/app-constants.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { BridgeService } from "../services/bridge/bridge-service.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";

function parseBridgeError(error: any): never {
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

  triggerAndWaitHandler = async (c: Context) => {
    try {
      const result = await BridgeService.triggerAndWait("33cf8aff-a1c8-4d67-aaee-cf84dce21e3c");
      return sendResponse(c, 200, BRIDGE_AGENT_TRIGGERED, result);
    } catch (error: any) {
      logger.error("Error at bridge triggerAndWait :", error);
      console.error("Error at bridge triggerAndWait :", error);
      parseBridgeError(error);
      throw error;
    }
  }
}
