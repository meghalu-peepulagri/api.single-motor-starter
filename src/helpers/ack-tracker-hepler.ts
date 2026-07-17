export const publishingMap = new Map<number, boolean>();

export const pendingAckMap = new Map<
  string,
  { resolve: (value: boolean) => void; sequenceNumber?: number }
>();

// Stores partial ACK results from T:33 device responses.
// Key = device MAC/PCB, value = schedule_ids the device confirmed it saved.
// Written by scheduleCreationAckResolver before resolving the pendingAckMap promise,
// consumed and deleted by schedule-sync-helper after publishMultipleTimesInBackground returns.
export const schedulePartialAckMap = new Map<string, number[]>();

// Shared shape for multi-motor command acks (state control T:1/T:31 and mode
// control T:2/T:32) — the resolver needs the raw per-motor status codes from the
// device (D: { m1: 1, m2: 6, ... }), not just a boolean.
export type DeviceCommandAckResult = {
  acked: boolean;
  // Raw D map from the device's ack, e.g. { m1: 1, m2: 6 }. Undefined on timeout.
  data?: Record<string, number>;
};

// Multi-motor control (T:1 -> T:31) ack tracking.
export type MotorControlAckResult = DeviceCommandAckResult;

export const motorControlPendingAckMap = new Map<
  string,
  { resolve: (result: DeviceCommandAckResult) => void; sequenceNumber: number }
>();

// Multi-motor mode change (T:2 -> T:32) ack tracking. Kept separate from
// motorControlPendingAckMap so a mode-change wait and a state-change wait for the
// same starter box (unlikely but possible) never resolve each other's promise.
export const modeControlPendingAckMap = new Map<
  string,
  { resolve: (result: DeviceCommandAckResult) => void; sequenceNumber: number }
>();

