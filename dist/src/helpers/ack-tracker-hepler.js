export const publishingMap = new Map();
export const pendingAckMap = new Map();
// Stores partial ACK results from T:33 device responses.
// Key = device MAC/PCB, value = schedule_ids the device confirmed it saved.
// Written by scheduleCreationAckResolver before resolving the pendingAckMap promise,
// consumed and deleted by schedule-sync-helper after publishMultipleTimesInBackground returns.
export const schedulePartialAckMap = new Map();
export const motorControlPendingAckMap = new Map();
// Multi-motor mode change (T:2 -> T:32) ack tracking. Kept separate from
// motorControlPendingAckMap so a mode-change wait and a state-change wait for the
// same starter box (unlikely but possible) never resolve each other's promise.
export const modeControlPendingAckMap = new Map();
