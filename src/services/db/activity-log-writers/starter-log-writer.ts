import { ActivityService } from "../activity-service.js";
import { prepareActionLog, prepareDeletionLog, prepareDeviceUpdateLogs } from "../../../helpers/activity-helper.js";

/**
 * Service to handle writing starter-related activity logs
 */
export class StarterLogWriter {
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
    await ActivityService.saveActivityLogs([log]);
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
      await ActivityService.saveActivityLogs(logs);
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
    await ActivityService.saveActivityLogs([log], trx);
  }

  /**
   * Logs multiple deletion events (e.g. Starter + Motor)
   */
  static async writeBatchDeletionLogs(logs: any[], trx?: any) {
    if (logs.length > 0) {
      await ActivityService.saveActivityLogs(logs, trx);
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
    await ActivityService.saveActivityLogs([log]);
  }
}
