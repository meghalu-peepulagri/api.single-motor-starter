import { logger } from "../../utils/logger.js";
import { userActivityLogs, type NewUserActivityLog } from "../../database/schemas/user-activity-logs.js";
import { saveRecords } from "./base-db-services.js";
import { prepareActionLog, prepareDeletionLog, prepareDeviceUpdateLogs, prepareMotorAckLogs, prepareMotorSyncLogs, prepareMotorUpdateLogs, prepareUserUpdateLogs } from "../../helpers/activity-helper.js";
import { log } from "console";

/**
 * Service to handle Database Level Activity Logs (Audit Trail)
 */
export class ActivityService {
  /**
   * Prepares an activity log object without saving it
   */
  static prepareActivityLog(data: {
    userId?: number;
    performedBy: number;
    action: string;
    entityType: 'STARTER' | 'MOTOR' | 'SETTING' | 'AUTH' | 'USER';
    entityId?: number;
    oldData?: any;
    newData?: any;
  }): NewUserActivityLog {
    return {
      user_id: data.userId || null,
      performed_by: data.performedBy,
      action: data.action,
      entity_type: data.entityType,
      entity_id: data.entityId || null,
      old_data: data.oldData ? JSON.stringify(data.oldData) : null,
      new_data: data.newData ? JSON.stringify(data.newData) : null,
    };
  }

  /**
   * Saves multiple activity logs to the database using base services
   */
  static async saveActivityLogs(logs: NewUserActivityLog[], trx?: any) {
    if (!logs || logs.length === 0) return;
    try {
      await saveRecords(userActivityLogs, logs, trx);

      logs.forEach(log => {
        logger.info(`Activity Saved: ${log.action} on ${log.entity_type} `, {
          entityId: log.entity_id,
          performedBy: log.performed_by
        });
      });
    } catch (error) {
      logger.error("Failed to save activity logs to DB", error);
    }
  }

  /**
   * Logs an activity to the database (Single helper)
   */
  static async logActivity(data: {
    userId?: number;
    performedBy: number;
    action: string;
    entityType: 'STARTER' | 'MOTOR' | 'SETTING' | 'AUTH' | 'USER';
    entityId?: number;
    oldData?: any;
    newData?: any;
  }, trx?: any) {
    const log = this.prepareActivityLog(data);
    await this.saveActivityLogs([log], trx);
  }

  /**
   * Logs a motor addition event
   */
  static async writeMotorAddedLog(userId: number, motorId: number, data: { name: string; hp: number | string; location_id: number }) {
    const log = prepareActionLog({
      userId,
      action: "MOTOR_ADDED",
      entityType: "MOTOR",
      entityId: motorId,
      newData: data
    });
    await this.saveActivityLogs([log]);
  }

  /**
   * Logs motor update events (renaming, HP updates)
   */
  static async writeMotorUpdatedLog(userId: number, motorId: number, oldData: { name: string | null; hp: string | null }, newData: { name?: string; hp?: string }) {
    console.log("oldData", oldData);
    console.log("newData", newData)
    const logs = prepareMotorUpdateLogs({
      userId,
      entityId: motorId,
      oldData,
      newData
    });

    if (logs.length > 0) {
      await this.saveActivityLogs(logs);
    }
  }

  /**
   * Logs a motor deletion event
   */
  static async writeMotorDeletedLog(userId: number, motorId: number, trx?: any) {
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
  static async writeMotorSyncLogs(userId: number, motorId: number, oldData: { state?: number; mode?: string }, newData: { state?: number; mode?: string }, trx?: any) {
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
  static async writeMotorAckLogs(userId: number, motorId: number, oldData: { state?: number; mode?: string }, newData: { state?: number; mode?: string }, action: "MOTOR_CONTROL_ACK" | "MOTOR_MODE_ACK", trx?: any) {
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
  static async writeStarterAssignedLog(userId: number, starterId: number, data: any) {
    const log = prepareActionLog({
      userId,
      action: "STARTER_ASSIGNED",
      entityType: "STARTER",
      entityId: starterId,
      newData: data
    });
    await this.saveActivityLogs([log]);
  }

  /**
   * Logs a starter update event (Name, PCB number)
   */
  static async writeStarterUpdatedLog(
    userId: number,
    starterId: number,
    oldData: {
      name: string | null;
      pcb_number: string | null;
      starter_number: string | null;
      mac_address: string | null;
      gateway_id: number | null
    },
    newData: {
      name?: string;
      pcb_number?: string;
      starter_number?: string;
      mac_address?: string;
      gateway_id?: number | null
    }
  ) {
    const logs = prepareDeviceUpdateLogs({
      userId,
      entityId: starterId,
      oldData,
      newData
    });

    if (logs.length > 0) {
      await this.saveActivityLogs(logs);
    }
  }

  /**
   * Logs a starter deletion or removal event
   */
  static async writeStarterDeletionLog(userId: number, starterId: number, action: "DEVICE_DELETED" | "STARTER_REMOVED", trx?: any) {
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
  static async writeBatchDeletionLogs(logs: NewUserActivityLog[], trx?: any) {
    if (logs.length > 0) {
      await this.saveActivityLogs(logs, trx);
    }
  }

  /**
   * Logs a location replacement event
   */
  static async writeLocationReplacedLog(userId: number, starterId: number, oldData: any, newData: any) {
    const log = prepareActionLog({
      userId,
      action: "LOCATION_REPLACED",
      entityType: "STARTER",
      entityId: starterId,
      oldData,
      newData
    });
    await this.saveActivityLogs([log]);
  }

  /**
   * Logs user profile update events
   */
  static async writeUserUpdatedLog(userId: number, performedBy: number, oldData: any, newData: any, trx?: any) {
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
}

