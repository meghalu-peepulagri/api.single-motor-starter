import { ActivityService } from "../activity-service.js";
import { prepareActionLog, prepareDeletionLog, prepareMotorAckLogs, prepareMotorSyncLogs, prepareMotorUpdateLogs } from "../../../helpers/activity-helper.js";

/**
 * Service to handle writing motor-related activity logs
 */
export class MotorLogWriter {
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
    await ActivityService.saveActivityLogs([log]);
  }

  /**
   * Logs motor update events (renaming, HP updates)
   */
  static async writeMotorUpdatedLog(userId: number, motorId: number, oldData: { name: string | null; hp: string | null }, newData: { name?: string; hp?: string }) {
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
  static async writeMotorDeletedLog(userId: number, motorId: number, trx?: any) {
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
  static async writeMotorSyncLogs(userId: number, motorId: number, oldData: { state?: number; mode?: string }, newData: { state?: number; mode?: string }, trx?: any) {
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
  static async writeMotorAckLogs(userId: number, motorId: number, oldData: { state?: number; mode?: string }, newData: { state?: number; mode?: string }, action: "MOTOR_CONTROL_ACK" | "MOTOR_MODE_ACK", trx?: any) {
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

