import { getDeviceStatusHistory, getMotorOnRuntime, getMotorStatusHistory, getPowerStatusHistory, } from "../services/db/status-history-query-services.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { DEVICE_STATUS_HISTORY_FETCHED, MOTOR_STATUS_HISTORY_FETCHED, POWER_STATUS_HISTORY_FETCHED, STARTER_RUNTIME_FETCHED, } from "../constants/app-constants.js";
import { parseStatusHistoryFilters } from "../helpers/status-history-helpers.js";
export class StatusHistoryHandlers {
    async getMotorStatusHistoryHandler(c) {
        try {
            const result = await getMotorStatusHistory(parseStatusHistoryFilters(c));
            return sendResponse(c, 200, MOTOR_STATUS_HISTORY_FETCHED, result);
        }
        catch (error) {
            logger.error("Error in getMotorStatusHistoryHandler:", error);
            throw error;
        }
    }
    async getPowerStatusHistoryHandler(c) {
        try {
            const result = await getPowerStatusHistory(parseStatusHistoryFilters(c));
            return sendResponse(c, 200, POWER_STATUS_HISTORY_FETCHED, result);
        }
        catch (error) {
            logger.error("Error in getPowerStatusHistoryHandler:", error);
            throw error;
        }
    }
    async getDeviceStatusHistoryHandler(c) {
        try {
            const result = await getDeviceStatusHistory(parseStatusHistoryFilters(c));
            return sendResponse(c, 200, DEVICE_STATUS_HISTORY_FETCHED, result);
        }
        catch (error) {
            logger.error("Error in getDeviceStatusHistoryHandler:", error);
            throw error;
        }
    }
    async getMotorRuntimeHandler(c) {
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
            return sendResponse(c, 200, STARTER_RUNTIME_FETCHED, result);
        }
        catch (error) {
            logger.error("Error in getMotorRuntimeHandler:", error);
            throw error;
        }
    }
}
