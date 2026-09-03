export const publishingMap = new Map();
// Bounds the heartbeat-driven settings sync (heartbeatHandler -> publishDeviceSettings).
// publishingMap only suppresses *overlapping* publishes inside one ack window; this
// caps how many windows a box gets before the auto-sync gives up, so a device that is
// online but never acks stops republishing its config on every heartbeat.
// Key = starter box id, value = publish cycles since the last successful ack.
export const settingsSyncAttemptsMap = new Map();
// Each cycle is itself 3 publishes with a 10s ack wait, so 3 cycles is ~90s of trying.
export const MAX_SETTINGS_SYNC_ATTEMPTS = 3;
export const getSettingsSyncAttempts = (starterId) => settingsSyncAttemptsMap.get(starterId) ?? 0;
export const incrementSettingsSyncAttempts = (starterId) => {
    const next = getSettingsSyncAttempts(starterId) + 1;
    settingsSyncAttemptsMap.set(starterId, next);
    return next;
};
export const clearSettingsSyncAttempts = (starterId) => {
    settingsSyncAttemptsMap.delete(starterId);
};
export const pendingAckMap = new Map();
// Stores partial ACK results from T:33 device responses.
// Key = device MAC/PCB, value = confirmed device_schedule_id slots, keyed by motor
// reference ("m1"/"m2"/...). Each motor has its own independent slot table on the
// device, so a bare slot number is ambiguous — it must be paired with which motor's
// bitmask (m1_ids/m2_ids/legacy flat ids) it was decoded from before matching.
// Written by scheduleCreationAckResolver before resolving the pendingAckMap promise,
// consumed and deleted by schedule-sync-helper after publishMultipleTimesInBackground returns.
export const schedulePartialAckMap = new Map();
export const motorControlPendingAckMap = new Map();
// Multi-motor mode change (T:2 -> T:32) ack tracking. Kept separate from
// motorControlPendingAckMap so a mode-change wait and a state-change wait for the
// same starter box (unlikely but possible) never resolve each other's promise.
export const modeControlPendingAckMap = new Map();
// Multi-motor settings/calibration (T:4 -> T:34) ack tracking, for MULTI_STARTER
// boxes only — the device's ack now carries per-motor status (D: { m1, m2 }) instead
// of the single scalar D:0|1 the SINGLE_STARTER CALIBRATION_ACK path (pendingAckMap,
// settings-helpers.ts) still uses untouched. Kept separate from that map so the two
// ack shapes can never resolve each other's promise.
export const settingsControlPendingAckMap = new Map();
