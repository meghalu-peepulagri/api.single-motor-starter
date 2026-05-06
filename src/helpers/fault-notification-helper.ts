import { getAlertNotificationMessage, getFaultNotificationMessage } from "./control-helpers.js";

export type FaultNotificationData = {
  userId: number;
  title: string;
  message: string;
  motorId: number;
  starter_id: number;
};

export type SignalCodeChange = {
  hasChanged: boolean;
  isDetected: boolean;
  isCleared: boolean;
};

function normalizeSignalCode(code: number | null | undefined): number | null {
  if (code === null || code === undefined || code === 0) {
    return null;
  }

  return code;
}

export function prepareSignalCodeChange(previousCode: number | null, currentCode: number | null): SignalCodeChange {
  const normalizedPreviousCode = normalizeSignalCode(previousCode);
  const normalizedCurrentCode = normalizeSignalCode(currentCode);
  const hasChanged = normalizedPreviousCode !== normalizedCurrentCode;
  const isDetected = normalizedPreviousCode === null && normalizedCurrentCode !== null;
  const isCleared = normalizedPreviousCode !== null && normalizedCurrentCode === null;

  return {
    hasChanged,
    isDetected,
    isCleared,
  };
}

export function shouldPersistSignalCodeChange(change: SignalCodeChange): boolean {
  return change.hasChanged;
}

export function prepareFaultNotificationData(params: {
  faultCode: number | null;
  faultDescription?: string | null;
  userId?: number | null;
  motorId?: number | null;
  starterId: number;
  pumpName: string;
}): FaultNotificationData | null {
  const { faultCode, faultDescription, userId, motorId, starterId, pumpName } = params;

  if (!faultDescription || userId === null || userId === undefined || !motorId || faultCode === null || faultCode === 0) {
    return null;
  }

  return {
    userId,
    title: `${pumpName} Fault Detected`,
    message: getFaultNotificationMessage(faultCode),
    motorId,
    starter_id: starterId,
  };
}

export function prepareFaultClearedNotificationData(params: {
  currentFaultCode: number | null;
  previousFaultCode: number | null;
  userId?: number | null;
  motorId?: number | null;
  starterId: number;
  pumpName: string;
}): FaultNotificationData | null {
  const { currentFaultCode, previousFaultCode, userId, motorId, starterId, pumpName } = params;

  if (currentFaultCode !== 0 || userId === null || userId === undefined || !motorId) {
    return null;
  }

  if (previousFaultCode === null || previousFaultCode === 0) {
    return null;
  }

  return {
    userId,
    title: `${pumpName} Faults Cleared`,
    message: `${pumpName} has no more faults`,
    motorId,
    starter_id: starterId,
  };
}

export function prepareAlertNotificationData(params: {
  alertCode: number | null;
  alertDescription?: string | null;
  userId?: number | null;
  motorId?: number | null;
  starterId: number;
  pumpName: string;
}): FaultNotificationData | null {
  const { alertCode, alertDescription, userId, motorId, starterId, pumpName } = params;

  if (!alertDescription || userId === null || userId === undefined || !motorId || alertCode === null || alertCode === 0) {
    return null;
  }

  return {
    userId,
    title: `${pumpName} Alert Detected`,
    message: getAlertNotificationMessage(alertCode),
    motorId,
    starter_id: starterId,
  };
}

export function prepareAlertClearedNotificationData(params: {
  currentAlertCode: number | null;
  previousAlertCode: number | null;
  userId?: number | null;
  motorId?: number | null;
  starterId: number;
  pumpName: string;
}): FaultNotificationData | null {
  const { currentAlertCode, previousAlertCode, userId, motorId, starterId, pumpName } = params;

  if (currentAlertCode !== 0 || userId === null || userId === undefined || !motorId) {
    return null;
  }

  if (previousAlertCode === null || previousAlertCode === 0) {
    return null;
  }

  return {
    userId,
    title: `${pumpName} Alerts Cleared`,
    message: `${pumpName} has no more alerts`,
    motorId,
    starter_id: starterId,
  };
}
