import type { Context } from "hono";
import {
  getDeviceStatusHistory,
  getMotorOnRuntime,
  getMotorStatusHistory,
  getPowerStatusHistory,
  type StatusHistoryFilters,
} from "../services/db/status-history-query-services.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";
import BadRequestException from "../exceptions/bad-request-exception.js";

function parseFilters(c: Context): StatusHistoryFilters {
  const q = c.req.query();
  return {
    starter_id: q.starter_id ? +q.starter_id : undefined,
    motor_id: q.motor_id ? +q.motor_id : undefined,
    from_date: q.from_date || undefined,
    to_date: q.to_date || undefined,
    status: q.status || undefined,
  };
}

export class StatusHistoryHandlers {
  async getMotorStatusHistoryHandler(c: Context) {
    try {
      const result = await getMotorStatusHistory(parseFilters(c));
      return sendResponse(c, 200, "Motor status history fetched successfully", result);
    } catch (error) {
      logger.error("Error in getMotorStatusHistoryHandler:", error);
      throw error;
    }
  }

  async getPowerStatusHistoryHandler(c: Context) {
    try {
      const result = await getPowerStatusHistory(parseFilters(c));
      return sendResponse(c, 200, "Power status history fetched successfully", result);
    } catch (error) {
      logger.error("Error in getPowerStatusHistoryHandler:", error);
      throw error;
    }
  }

  async getDeviceStatusHistoryHandler(c: Context) {
    try {
      const result = await getDeviceStatusHistory(parseFilters(c));
      return sendResponse(c, 200, "Device status history fetched successfully", result);
    } catch (error) {
      logger.error("Error in getDeviceStatusHistoryHandler:", error);
      throw error;
    }
  }

  async getMotorRuntimeHandler(c: Context) {
    try {
      const q = c.req.query();
      if (!q.starter_id || !q.motor_id || !q.from_date || !q.to_date) {
        throw new BadRequestException("starter_id, motor_id, from_date and to_date are required");
      }
      const result = await getMotorOnRuntime({
        starter_id: +q.starter_id,
        motor_id: +q.motor_id,
        from_date: q.from_date,
        to_date: q.to_date,
      });
      return sendResponse(c, 200, "Motor runtime fetched successfully", result);
    } catch (error) {
      logger.error("Error in getMotorRuntimeHandler:", error);
      throw error;
    }
  }
}
