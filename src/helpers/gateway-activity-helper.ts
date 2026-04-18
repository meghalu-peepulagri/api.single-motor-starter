import type { NewUserActivityLog } from "../database/schemas/user-activity-logs.js";
import type { Gateway } from "../database/schemas/gateways.js";
import { ActivityService } from "../services/db/activity-service.js";

export function prepareGatewayAddedLog(data: {
  performedBy: number;
  userId: number;
  gateway: Pick<Gateway, "id" | "name" | "label" | "mac_address" | "pcb_number" | "user_id">;
}): NewUserActivityLog {
  return ActivityService.prepareActivityLog({
    userId: data.userId,
    performedBy: data.performedBy,
    action: "GATEWAY_ADDED",
    entityType: "GATEWAY",
    entityId: data.gateway.id,
    newData: {
      name: data.gateway.name,
      label: data.gateway.label,
      mac_address: data.gateway.mac_address,
      pcb_number: data.gateway.pcb_number,
      user_id: data.gateway.user_id,
    },
    message: `Gateway '${data.gateway.name}' added.`,
  });
}

export function prepareGatewayDeletedLog(data: {
  performedBy: number;
  userId: number;
  gateway: Pick<Gateway, "id" | "name" | "label" | "status" | "user_id">;
}): NewUserActivityLog {
  return ActivityService.prepareActivityLog({
    userId: data.userId,
    performedBy: data.performedBy,
    action: "GATEWAY_DELETED",
    entityType: "GATEWAY",
    entityId: data.gateway.id,
    oldData: {
      status: data.gateway.status,
      name: data.gateway.name,
      label: data.gateway.label,
      user_id: data.gateway.user_id,
    },
    newData: {
      status: "ARCHIVED",
      user_id: null,
    },
    message: `Gateway '${data.gateway.name}' deleted.`,
  });
}

export function prepareGatewayLabelUpdatedLog(data: {
  performedBy: number;
  userId: number;
  gatewayId: number;
  oldLabel: string | null;
  newLabel: string;
}): NewUserActivityLog {
  return ActivityService.prepareActivityLog({
    userId: data.userId,
    performedBy: data.performedBy,
    action: "GATEWAY_LABEL_UPDATED",
    entityType: "GATEWAY",
    entityId: data.gatewayId,
    oldData: { label: data.oldLabel },
    newData: { label: data.newLabel },
    message: `Gateway label updated to '${data.newLabel}'.`,
  });
}

export function prepareGatewayRenamedLog(data: {
  performedBy: number;
  userId: number;
  gatewayId: number;
  oldName: string;
  newName: string;
}): NewUserActivityLog {
  return ActivityService.prepareActivityLog({
    userId: data.userId,
    performedBy: data.performedBy,
    action: "GATEWAY_RENAMED",
    entityType: "GATEWAY",
    entityId: data.gatewayId,
    oldData: { name: data.oldName },
    newData: { name: data.newName },
    message: `Gateway renamed to '${data.newName}'.`,
  });
}

export function prepareGatewayAssignedLog(data: {
  performedBy: number;
  userId: number;
  gatewayId: number;
  gatewayName: string;
  oldUserId: number | null;
  newUserId: number;
}): NewUserActivityLog {
  return ActivityService.prepareActivityLog({
    userId: data.userId,
    performedBy: data.performedBy,
    action: "GATEWAY_ASSIGNED",
    entityType: "GATEWAY",
    entityId: data.gatewayId,
    oldData: { user_id: data.oldUserId },
    newData: { user_id: data.newUserId },
    message: `Gateway '${data.gatewayName}' assigned.`,
  });
}

export function prepareGatewayNumberUpdatedLog(data: {
  performedBy: number;
  userId: number;
  gatewayId: number;
  gatewayName: string;
  oldGatewayNumber: string | null;
  newGatewayNumber: string;
}): NewUserActivityLog {
  return ActivityService.prepareActivityLog({
    userId: data.userId,
    performedBy: data.performedBy,
    action: "GATEWAY_NUMBER_UPDATED",
    entityType: "GATEWAY",
    entityId: data.gatewayId,
    oldData: { gateway_number: data.oldGatewayNumber },
    newData: { gateway_number: data.newGatewayNumber },
    message: `Gateway '${data.gatewayName}' number updated to '${data.newGatewayNumber}'.`,
  });
}
