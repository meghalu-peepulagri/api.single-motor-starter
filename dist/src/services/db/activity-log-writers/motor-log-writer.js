import { ActivityService } from "../activity-service.js";
import { prepareActionLog, prepareDeletionLog, prepareMotorAckLogs, prepareMotorSyncLogs, prepareMotorUpdateLogs } from "../../../helpers/activity-helper.js";
/**
 * Service to handle writing motor-related activity logs
 */
export class MotorLogWriter {
    /**
     * Logs a motor addition event
     */
    static async writeMotorAddedLog(userId, motorId, data) {
        const log = prepareActionLog({
            userId,
            action: "MOTOR_ADDED",
            entityType: "MOTOR",
            entityId: motorId,
            newData: data
        });
        await ActivityService.saveActivityLogs([log]);
    }
    /**
     * Logs motor update events (renaming, HP updates)
     */
    static async writeMotorUpdatedLog(userId, motorId, oldData, newData) {
        const logs = prepareMotorUpdateLogs({
            userId,
            entityId: motorId,
            oldData,
            newData
        });
        if (logs.length > 0) {
            await ActivityService.saveActivityLogs(logs);
        }
    }
    /**
     * Logs a motor deletion event
     */
    static async writeMotorDeletedLog(userId, motorId, trx) {
        const log = prepareDeletionLog({
            userId,
            entityType: "MOTOR",
            entityId: motorId,
            action: "MOTOR_DELETED"
        });
        await ActivityService.saveActivityLogs([log], trx);
    }
    /**
     * Logs motor state/mode sync from MQTT
     */
    static async writeMotorSyncLogs(userId, motorId, oldData, newData, trx) {
        const logs = prepareMotorSyncLogs({
            userId,
            entityId: motorId,
            oldData,
            newData
        });
        if (logs.length > 0) {
            await ActivityService.saveActivityLogs(logs, trx);
        }
    }
    /**
     * Logs motor control/mode ACKs from MQTT
     */
    static async writeMotorAckLogs(userId, motorId, oldData, newData, action, trx) {
        const logs = prepareMotorAckLogs({
            userId,
            entityId: motorId,
            oldData,
            newData,
            action
        });
        if (logs.length > 0) {
            await ActivityService.saveActivityLogs(logs, trx);
        }
    }
}
