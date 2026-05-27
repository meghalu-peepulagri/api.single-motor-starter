export const publishingMap = new Map();
export const pendingAckMap = new Map();
// Stores partial ACK results from T:33 device responses.
// Key = device MAC/PCB, value = schedule_ids the device confirmed it saved.
// Written by scheduleCreationAckResolver before resolving the pendingAckMap promise,
// consumed and deleted by schedule-sync-helper after publishMultipleTimesInBackground returns.
export const schedulePartialAckMap = new Map();
