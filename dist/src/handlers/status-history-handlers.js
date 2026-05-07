import { getDeviceStatusHistory, getMotorOnRuntime, getMotorStatusHistory, getPowerStatusHistory, } from "../services/db/status-history-query-services.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { DEVICE_STATUS_HISTORY_FETCHED, MOTOR_NOT_FOUND, MOTOR_STATUS_HISTORY_FETCHED, POWER_STATUS_HISTORY_FETCHED, STARTER_RUNTIME_FETCHED, } from "../constants/app-constants.js";
import { parseStatusHistoryFilters } from "../helpers/status-history-helpers.js";
import { motors } from "../database/schemas/motors.js";
import { and, eq, ne } from "drizzle-orm";
import db from "../database/configuration.js";
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
            const starterId = +q.starter_id;
            let motorId;
            const numericId = Number(q.motor_id);
            if (Number.isInteger(numericId) && numericId > 0) {
                motorId = numericId;
            }
            else {
                // motor_reference like "m1" / "m2" — resolve to numeric motor_id
                const [motor] = await db
                    .select({ id: motors.id })
                    .from(motors)
                    .where(and(eq(motors.starter_id, starterId), eq(motors.motor_reference, q.motor_id), ne(motors.status, "ARCHIVED")))
                    .limit(1);
                if (!motor)
                    throw new NotFoundException(MOTOR_NOT_FOUND);
                motorId = motor.id;
            }
            const result = await getMotorOnRuntime({
                starter_id: starterId,
                motor_id: motorId,
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
