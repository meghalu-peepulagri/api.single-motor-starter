import { userActivityLogs } from "../../database/schemas/user-activity-logs.js";
import { prepareActionLog, prepareDeletionLog, prepareDeviceUpdateLogs, prepareMotorAckLogs, prepareMotorSyncLogs, prepareMotorUpdateLogs, prepareSettingsUpdateLogs, prepareUserUpdateLogs } from "../../helpers/activity-helper.js";
import { logger } from "../../utils/logger.js";
import { saveRecords } from "./base-db-services.js";
import { log } from "node:console";
/**
 * Service to handle Database Level Activity Logs (Audit Trail)
 */
export class ActivityService {
    /**
     * Prepares an activity log object without saving it
     */
    static prepareActivityLog(data) {
        return {
            user_id: data.userId || null,
            performed_by: data.performedBy,
            action: data.action,
            entity_type: data.entityType,
            entity_id: data.entityId || null,
            old_data: data.oldData ? JSON.stringify(data.oldData) : null,
            new_data: data.newData ? JSON.stringify(data.newData) : null,
            message: data.message || null,
        };
    }
    /**
     * Saves multiple activity logs to the database using base services
     */
    static async saveActivityLogs(logs, trx) {
        if (!logs || logs.length === 0)
            return;
        try {
            await saveRecords(userActivityLogs, logs, trx);
            logs.forEach(log => {
                logger.info(`Activity Saved: ${log.action} on ${log.entity_type} `, {
                    entityId: log.entity_id,
                    performedBy: log.performed_by
                });
            });
        }
        catch (error) {
            logger.error("Failed to save activity logs to DB", error);
        }
    }
    /**
     * Logs an activity to the database (Single helper)
     */
    static async logActivity(data, trx) {
        const log = this.prepareActivityLog(data);
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs a motor addition event
     */
    static async writeMotorAddedLog(userId, motorId, data, trx) {
        const log = prepareActionLog({
            userId,
            action: "MOTOR_ADDED",
            entityType: "MOTOR",
            entityId: motorId,
            newData: data
        });
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs motor update events (renaming, HP updates)
     */
    static async writeMotorUpdatedLog(userId, motorId, oldData, newData, trx) {
        const logs = prepareMotorUpdateLogs({
            userId,
            entityId: motorId,
            oldData,
            newData
        });
        if (logs.length > 0) {
            await this.saveActivityLogs(logs, trx);
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
        await this.saveActivityLogs([log], trx);
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
            await this.saveActivityLogs(logs, trx);
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
            await this.saveActivityLogs(logs, trx);
        }
    }
    /**
     * Logs a starter assignment event
     */
    static async writeStarterAssignedLog(userId, starterId, data, trx) {
        const log = prepareActionLog({
            userId,
            action: "STARTER_ASSIGNED",
            entityType: "STARTER",
            entityId: starterId,
            newData: data
        });
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs a starter update event (Name, PCB number)
     */
    static async writeStarterUpdatedLog(userId, starterId, oldData, newData, trx) {
        const logs = prepareDeviceUpdateLogs({
            userId,
            entityId: starterId,
            oldData,
            newData
        });
        if (logs.length > 0) {
            await this.saveActivityLogs(logs, trx);
        }
    }
    /**
     * Logs a starter deletion or removal event
     */
    static async writeStarterDeletionLog(userId, starterId, action, trx) {
        const log = prepareDeletionLog({
            userId,
            entityType: "STARTER",
            entityId: starterId,
            action
        });
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs multiple deletion events (e.g. Starter + Motor)
     */
    static async writeBatchDeletionLogs(logs, trx) {
        if (logs.length > 0) {
            await this.saveActivityLogs(logs, trx);
        }
    }
    /**
     * Logs a location replacement event
     */
    static async writeLocationReplacedLog(userId, starterId, oldData, newData, trx) {
        const log = prepareActionLog({
            userId,
            action: "LOCATION_REPLACED",
            entityType: "STARTER",
            entityId: starterId,
            oldData,
            newData
        });
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs user profile update events
     */
    static async writeUserUpdatedLog(userId, performedBy, oldData, newData, trx) {
        const logs = prepareUserUpdateLogs({
            userId,
            performedBy,
            oldData,
            newData
        });
        if (logs.length > 0) {
            await this.saveActivityLogs(logs, trx);
        }
    }
    /**
     * Logs starter settings update events
     */
    static async writeStarterSettingsUpdatedLog(userId, starterId, oldData, newData, trx) {
        const logs = prepareSettingsUpdateLogs({
            userId,
            starterId,
            oldData,
            newData
        });
        if (logs.length > 0) {
            await this.saveActivityLogs(logs, trx);
        }
    }
    /**
     * Logs a location addition event
     */
    static async writeLocationAddedLog(userId, locationId, data, trx) {
        const log = prepareActionLog({
            userId,
            action: "LOCATION_ADDED",
            entityType: "LOCATION",
            entityId: locationId,
            newData: data
        });
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs a location rename event
     */
    static async writeLocationRenamedLog(userId, locationId, oldData, newData, trx) {
        const log = prepareActionLog({
            userId,
            action: "LOCATION_RENAMED",
            entityType: "LOCATION",
            entityId: locationId,
            oldData,
            newData
        });
        await this.saveActivityLogs([log], trx);
    }
    /**
     * Logs a location deletion event
     */
    static async writeLocationDeletedLog(userId, locationId, trx) {
        const log = prepareDeletionLog({
            userId,
            entityType: "LOCATION",
            entityId: locationId,
            action: "LOCATION_DELETED"
        });
        await this.saveActivityLogs([log], trx);
    }
}
