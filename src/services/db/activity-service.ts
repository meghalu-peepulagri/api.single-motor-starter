import { userActivityLogs, type NewUserActivityLog } from "../../database/schemas/user-activity-logs.js";
import { prepareActionLog, prepareDeletionLog, prepareDeviceUpdateLogs, prepareMotorAckLogs, prepareMotorSyncLogs, prepareMotorUpdateLogs, prepareSettingsUpdateLogs, prepareUserUpdateLogs } from "../../helpers/activity-helper.js";
import { logger } from "../../utils/logger.js";
import { saveRecords } from "./base-db-services.js";
import type { Motor } from "../../database/schemas/motors.js";
import type { StarterBox } from "../../database/schemas/starter-boxes.js";
import type { Location } from "../../database/schemas/locations.js";
import type { User } from "../../database/schemas/users.js";
import { log } from "node:console";

type Transaction = any; // Placeholder for now, but will use more specific types for data

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
    entityType: 'STARTER' | 'MOTOR' | 'SETTING' | 'AUTH' | 'USER' | 'LOCATION';
    entityId?: number;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
    message?: string;
  }): NewUserActivityLog {
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
    entityType: 'STARTER' | 'MOTOR' | 'SETTING' | 'AUTH' | 'USER' | 'LOCATION';
    entityId?: number;
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
  }, trx?: Transaction) {
    const log = this.prepareActivityLog(data);
    await this.saveActivityLogs([log], trx);
  }

  /**
   * Logs a motor addition event
   */
  static async writeMotorAddedLog(userId: number, motorId: number, data: { name: string | null; hp: number | string; location_id: number | null }, trx?: any) {
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
  static async writeMotorUpdatedLog(userId: number, motorId: number, oldData: { name: string | null; hp: string | null; state?: number | null; mode?: string | null }, newData: { name?: string | null; hp?: string | null; state?: number | null; mode?: string | null }, trx?: any) {

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
  static async writeStarterAssignedLog(userId: number, starterId: number, data: { user_id: number; location_id?: number | null; motor_name?: string }, trx?: Transaction) {
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
      name?: string | null;
      pcb_number?: string | null;
      starter_number?: string | null;
      mac_address?: string | null;
      gateway_id?: number | null
    },
    trx?: Transaction
  ) {
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
  static async writeStarterDeletionLog(userId: number, starterId: number, action: "DEVICE_DELETED" | "STARTER_REMOVED", trx?: Transaction) {
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
  static async writeBatchDeletionLogs(logs: NewUserActivityLog[], trx?: Transaction) {
    if (logs.length > 0) {
      await this.saveActivityLogs(logs, trx);
    }
  }

  /**
   * Logs a location replacement event
   */
  static async writeLocationReplacedLog(userId: number, starterId: number, oldData: { location_id: number | null }, newData: { location_id: number; motor_id: number }, trx?: Transaction) {
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
  static async writeUserUpdatedLog(userId: number, performedBy: number, oldData: Partial<User>, newData: Partial<User>, trx?: Transaction) {
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
  static async writeStarterSettingsUpdatedLog(
    userId: number,
    starterId: number,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    trx?: Transaction
  ) {
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
  static async writeLocationAddedLog(userId: number, locationId: number, data: { name: string }, trx?: Transaction) {
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
  static async writeLocationRenamedLog(userId: number, locationId: number, oldData: { name: string }, newData: { name: string }, trx?: Transaction) {
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
  static async writeLocationDeletedLog(userId: number, locationId: number, trx?: Transaction) {
    const log = prepareDeletionLog({
      userId,
      entityType: "LOCATION",
      entityId: locationId,
      action: "LOCATION_DELETED"
    });
    await this.saveActivityLogs([log], trx);
  }
}
