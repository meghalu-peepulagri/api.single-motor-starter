import axios from "axios";
import bridgeConfig from "../../config/bridge-config.js";
import BadRequestException from "../../exceptions/bad-request-exception.js";
import { logger } from "../../utils/logger.js";

const BRIDGE_URL = bridgeConfig.baseUrl;
const MAX_POLL_ATTEMPTS = 2;
const POLL_INTERVAL_MS = 1000;

export class BridgeService {

  //  Health Check
  static async healthCheck() {
    const response = await axios.get(`${BRIDGE_URL}/health`);
    if (!response.data.ok) {
      throw new BadRequestException("Bridge reported unhealthy status");
    }
    return response.data;
  }

  // Trigger Agent
  static async triggerAgent(agentId: string) {
    const response = await axios.post(`${BRIDGE_URL}/api/read/${agentId}`);
    return response.data;
  }

  //  Get Result
  static async getResult(requestId: string) {
    const response = await axios.get(`${BRIDGE_URL}/api/results/${requestId}`);
    return response.data;
  }

  //  Trigger and Wait
  static async triggerAndWait(agentId: string) {
    try {

      // Step 1: Health check
      await this.healthCheck();

      // Step 2: Trigger agent
      const trigger = await this.triggerAgent(agentId);

      const requestId = trigger?.requestId;
      if (!requestId) {
        throw new BadRequestException("Bridge agent did not return a valid request ID.");
      }

      // Step 3: Poll for results
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        const result = await this.getResult(requestId);
        if (result?.ok !== null && result?.ok !== undefined) {
          return result;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      throw new BadRequestException(`Timeout waiting for agent response after ${MAX_POLL_ATTEMPTS} attempts`);

    } catch (error: any) {
      logger.error("triggerAndWait error:", error?.message);

      if (error instanceof BadRequestException) {
        throw error;
      }

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

      throw new BadRequestException(error?.message || "Bridge service request failed");
    }
  }
}