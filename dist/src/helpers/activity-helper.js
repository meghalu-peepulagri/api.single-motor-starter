import { SETTINGS_FIELD_NAMES } from "../constants/app-constants.js";
import { ActivityService } from "../services/db/activity-service.js";
/**
 * Helper to prepare granular activity logs for device updates
 */
export function prepareDeviceUpdateLogs(data) {
    const logs = [];
    if (data.newData.name !== undefined && data.newData.name !== data.oldData.name) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "DEVICE_RENAMED",
            entityType: "STARTER",
            entityId: data.entityId,
            oldData: { name: data.oldData.name },
            newData: { name: data.newData.name }
        }));
    }
    if (data.newData.pcb_number !== undefined && data.newData.pcb_number !== data.oldData.pcb_number) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "DEVICE_PCB_UPDATED",
            entityType: "STARTER",
            entityId: data.entityId,
            oldData: { pcb_number: data.oldData.pcb_number },
            newData: { pcb_number: data.newData.pcb_number }
        }));
    }
    if (data.newData.starter_number !== undefined && data.newData.starter_number !== data.oldData.starter_number) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "DEVICE_NUMBER_UPDATED",
            entityType: "STARTER",
            entityId: data.entityId,
            oldData: { starter_number: data.oldData.starter_number },
            newData: { starter_number: data.newData.starter_number }
        }));
    }
    if (data.newData.mac_address !== undefined && data.newData.mac_address !== data.oldData.mac_address) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "DEVICE_MAC_UPDATED",
            entityType: "STARTER",
            entityId: data.entityId,
            oldData: { mac_address: data.oldData.mac_address },
            newData: { mac_address: data.newData.mac_address }
        }));
    }
    if (data.newData.gateway_id !== undefined && data.newData.gateway_id !== data.oldData.gateway_id) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "DEVICE_GATEWAY_UPDATED",
            entityType: "STARTER",
            entityId: data.entityId,
            oldData: { gateway_id: data.oldData.gateway_id },
            newData: { gateway_id: data.newData.gateway_id }
        }));
    }
    return logs;
}
/**
 * Helper to prepare granular activity logs for motor updates
 */
export function prepareMotorUpdateLogs(data) {
    const logs = [];
    if (data.newData.name && data.newData.name !== data.oldData.name) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "MOTOR_RENAMED",
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { name: data.oldData.name },
            newData: { name: data.newData.name },
            message: `Name updated from '${data.oldData.name}' to '${data.newData.name}'`
        }));
    }
    if (data.newData.hp && data.newData.hp !== data.oldData.hp) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "MOTOR_HP_UPDATED",
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { hp: data.oldData.hp },
            newData: { hp: data.newData.hp },
            message: `Hp updated from '${data.oldData.hp}' to '${data.newData.hp}'`
        }));
    }
    if (data.newData.state !== undefined && data.newData.state !== null && data.newData.state !== data.oldData.state) {
        const mode = data.newData.mode ?? data.oldData.mode;
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "MOTOR_STATE_UPDATED",
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { state: data.oldData.state },
            newData: { state: data.newData.state },
            message: `State updated from '${data.oldData.state}' to '${data.newData.state}' with mode '${mode}'`
        }));
    }
    if (data.newData.mode !== undefined && data.newData.mode !== null && data.newData.mode !== data.oldData.mode) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "MOTOR_MODE_UPDATED",
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { mode: data.oldData.mode },
            newData: { mode: data.newData.mode },
            message: `Mode updated from '${data.oldData.mode}' to '${data.newData.mode}'`
        }));
    }
    return logs;
}
/**
 * Helper to prepare a deletion log
 */
export function prepareDeletionLog(data) {
    return ActivityService.prepareActivityLog({
        performedBy: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldData: data.entityName ? { name: data.entityName } : null
    });
}
/**
 * Helper to prepare a creation or assignment log
 */
export function prepareActionLog(data) {
    return ActivityService.prepareActivityLog({
        performedBy: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldData: data.oldData,
        newData: data.newData
    });
}
/**
 * Helper to prepare granular activity logs for motor state/mode sync from MQTT
 */
export function prepareMotorSyncLogs(data) {
    const logs = [];
    if (data.newData.state !== undefined && data.newData.state !== data.oldData.state) {
        const mode = data.newData.mode ?? data.oldData.mode;
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "MOTOR_STATE_SYNC",
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { state: data.oldData.state },
            newData: { state: data.newData.state },
            message: `State updated from '${data.oldData.state}' to '${data.newData.state}' with mode '${mode}'`
        }));
    }
    if (data.newData.mode !== undefined && data.newData.mode !== data.oldData.mode) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: "MOTOR_MODE_SYNC",
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { mode: data.oldData.mode },
            newData: { mode: data.newData.mode },
            message: `Mode updated from '${data.oldData.mode}' to '${data.newData.mode}'`
        }));
    }
    return logs;
}
/**
 * Helper to prepare granular activity logs for motor ACKs (Control/Mode)
 */
export function prepareMotorAckLogs(data) {
    const logs = [];
    if (data.newData.state !== undefined && data.newData.state !== data.oldData.state) {
        const mode = data.newData.mode ?? data.oldData.mode;
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: data.action,
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { state: data.oldData.state },
            newData: { state: data.newData.state },
            message: `State updated from '${data.oldData.state}' to '${data.newData.state}' with mode '${mode}'`
        }));
    }
    if (data.newData.mode !== undefined && data.newData.mode !== data.oldData.mode) {
        logs.push(ActivityService.prepareActivityLog({
            performedBy: data.userId,
            action: data.action,
            entityType: "MOTOR",
            entityId: data.entityId,
            oldData: { mode: data.oldData.mode },
            newData: { mode: data.newData.mode },
            message: `Mode updated from '${data.oldData.mode}' to '${data.newData.mode}'`
        }));
    }
    return logs;
}
/**
 * Helper to prepare granular activity logs for user updates
 */
export function prepareUserUpdateLogs(data) {
    const logs = [];
    const fieldsToTrack = ["full_name", "phone", "email"];
    fieldsToTrack.forEach((field) => {
        if (data.newData[field] !== undefined && String(data.newData[field]) !== String(data.oldData[field])) {
            logs.push(ActivityService.prepareActivityLog({
                userId: data.userId,
                performedBy: data.performedBy,
                action: `USER_${field.toUpperCase()}_UPDATED`,
                entityType: "USER",
                entityId: data.userId,
                oldData: { [field]: data.oldData[field] },
                newData: { [field]: data.newData[field] }
            }));
        }
    });
    return logs;
}
/**
 * Helper to prepare granular activity logs for starter settings updates
 */
export function prepareSettingsUpdateLogs(data) {
    const logs = [];
    Object.keys(data.newData).forEach((field) => {
        // Only track if the field exists in SETTINGS_FIELD_NAMES and has changed
        if (SETTINGS_FIELD_NAMES[field] &&
            data.newData[field] !== undefined &&
            data.newData[field] !== null &&
            String(data.newData[field]) !== String(data.oldData[field])) {
            logs.push(ActivityService.prepareActivityLog({
                performedBy: data.userId,
                action: `SETTING_${field.toUpperCase()}_UPDATED`,
                entityType: "SETTING",
                entityId: data.starterId,
                oldData: { [field]: data.oldData[field] },
                newData: { [field]: data.newData[field] }
            }));
        }
    });
    return logs;
}
