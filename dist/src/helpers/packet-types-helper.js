export const REQUEST_TYPES = {
    MOTOR_CONTROL: 1,
    MODE_CHANGE: 2,
    SCHEDULING: 3, // TOPIC_SCHEDULING_CREATE
    // Renumbered 4 -> 5: TOPIC_CALIBRATION is 5 in the device spec, and 4/34 now belong
    // to TOPIC_SCHEDULE_UPDATE (a packet this backend does not implement).
    CALIBRATION: 5,
    LIVE_DATA_REQUEST: 9,
    CONFIG_DATA_REQUEST: 6,
    SCHEDULING_DATA_REQUEST: 7,
    POWER_INFO_REQUEST: 8,
    DEVICE_INFO_REQUEST: 15, // renumbered 10 -> 15
    QUECTEL_FILE_DELETE: 11,
    QUECTEL_FILE_ADD: 12,
    UPDATE_STARTER_SETTINGS: 13
};
export const ACK_TYPES = {
    LIVE_DATA: 47, // renumbered 41 -> 47
    MOTOR_CONTROL_ACK: 31,
    MODE_CHANGE_ACK: 32,
    SCHEDULING_ACK: 33, // TOPIC_SCHEDULING_CREATE_ACK
    CALIBRATION_ACK: 35, // renumbered 34 -> 35, matching CALIBRATION 4 -> 5
    LIVE_DATA_REQUEST_ACK: 39, // renumbered 35 -> 39, matching LIVE_DATA_REQUEST 5 -> 9
    CONFIG_DATA_REQUEST_ACK: 36,
    SCHEDULING_DATA_REQUEST_ACK: 37,
    POWER_INFO_REQUEST_ACK: 38,
    DEVICE_INFO_ACK: 45, // renumbered 39 -> 45, matching DEVICE_INFO_REQUEST 10 -> 15
    HEART_BEAT: 46, // renumbered 40 -> 46
    QUECTEL_FILE_DELETE_ACK: 42,
    QUECTEL_FILE_ADD_ACK: 43,
    ADMIN_CONFIG_DATA_REQUEST_ACK: 44
};
export function findTopicACKByType(payload) {
    const type = payload.T;
    switch (type) {
        case 31: return "MOTOR_CONTROL_ACK";
        case 32: return "MODE_CHANGE_ACK";
        case 33: return "SCHEDULING_ACK";
        case 35: return "CALIBRATION_ACK";
        // 36 was USER_CONFIG_DATA_REQUEST_ACK, 37 SCHEDULING_DATA_REQUEST_ACK and 38
        // POWER_INFO_REQUEST_ACK before the spec reassigned 36/38 to serial-number update and
        // device reset. None of the three was routed by selectTopicAck.
        // case 36: return "USER_CONFIG_DATA_REQUEST_ACK";
        // case 37: return "SCHEDULING_DATA_REQUEST_ACK";
        // case 38: return "POWER_INFO_REQUEST_ACK";
        case 36: return "DEVICE_SERIAL_NUMBER_ALLOCATION_ACK"; // was 48
        case 38: return "DEVICE_RESET_ACK"; // was 52
        case 39: return "LIVE_DATA_REQUEST_ACK";
        case 42: return "QUECTEL_FILE_DELETE_ACK";
        case 43: return "QUECTEL_FILE_ADD_ACK";
        case 44: return "ADMIN_CONFIG_DATA_REQUEST_ACK";
        // 45 was FOTA_REQUEST_ACK, unrouted, before the spec gave it to device info.
        // case 45: return "FOTA_REQUEST_ACK"
        case 45: return "DEVICE_INFO_ACK"; // was 39
        // 46/47 were FOTA_FILE_INFO_ACK / FOTA_INITIALIZATION_REQUEST_ACK before the device
        // spec reassigned them to heartbeat and live data. Neither FOTA case was routed by
        // selectTopicAck, so nothing was lost — kept here for reference if FOTA comes back.
        // case 46: return "FOTA_FILE_INFO_ACK"
        // case 47: return "FOTA_INITIALIZATION_REQUEST_ACK"
        case 46: return "HEART_BEAT";
        case 47: return "LIVE_DATA";
        case 49: return "BOOT_MANIFEST_ACK";
        case 50: return "TEMPERATURE_THRESHOLD_SETTING";
        default: return "UNKNOWN";
    }
}
// Status codes reported by the device inside a MOTOR_CONTROL_ACK (T:31) payload's
// `D.m<N>` values, e.g. `{ "T": 31, "S": 89, "D": { "m1": 1, "m2": 6 } }`.
// Only STATUS_OFF/STATUS_ON reflect an actual motor state change — the rest are
// rejection/error reasons the device sends back instead of actuating the motor.
export const MOTOR_CONTROL_STATUS = {
    STATUS_OFF: 0,
    STATUS_ON: 1,
    STATUS_POWER_NOT_PRESENT: 2,
    STATUS_FAULT_BLOCKED: 3,
    STATUS_INVALID_CONTROL_MODE_CHANGE: 4,
    STATUS_INVALID_REQUEST: 5,
    STATUS_ALREADY_ON: 6,
    STATUS_ALREADY_OFF: 7,
    STATUS_FEATURE_NOT_ENABLED: 8,
};
export function getMotorControlStatusDescription(code) {
    switch (code) {
        case MOTOR_CONTROL_STATUS.STATUS_OFF: return "Motor turned OFF";
        case MOTOR_CONTROL_STATUS.STATUS_ON: return "Motor turned ON";
        case MOTOR_CONTROL_STATUS.STATUS_POWER_NOT_PRESENT: return "Power not present";
        case MOTOR_CONTROL_STATUS.STATUS_FAULT_BLOCKED: return "Blocked by an active fault";
        case MOTOR_CONTROL_STATUS.STATUS_INVALID_CONTROL_MODE_CHANGE: return "Invalid control mode change";
        case MOTOR_CONTROL_STATUS.STATUS_INVALID_REQUEST: return "Invalid request";
        case MOTOR_CONTROL_STATUS.STATUS_ALREADY_ON: return "Motor already ON";
        case MOTOR_CONTROL_STATUS.STATUS_ALREADY_OFF: return "Motor already OFF";
        case MOTOR_CONTROL_STATUS.STATUS_FEATURE_NOT_ENABLED: return "Feature not enabled";
        default: return "Unknown motor control status";
    }
}
// STATUS_OFF/STATUS_ON are the only codes that represent a real state transition;
// every other code is an error/rejection reason and must not be written to motors.state.
export function isMotorControlStateCode(code) {
    return code === MOTOR_CONTROL_STATUS.STATUS_OFF || code === MOTOR_CONTROL_STATUS.STATUS_ON;
}
// Status codes reported by the device inside a MODE_CHANGE_ACK (T:32) payload's
// `D.m<N>` values, e.g. `{ "T": 32, "S": 89, "D": { "m1": 1, "m2": 6 } }`.
// Codes 0/1/2 are the actual mode reached; 3-8 are rejection reasons the device
// sends back instead of changing mode. NOTE: this numbering is specific to the
// multi-motor MODE_CHANGE ack and intentionally differs from the legacy scalar
// `controlMode()` mapping in control-helpers.ts (used for single-motor live-data
// mode parsing, T:41/35) — the two message types are not interchangeable.
export const MODE_CONTROL_STATUS = {
    MANUAL: 0,
    AUTO: 1,
    SCHEDULE: 2,
    STATUS_FAULT_BLOCKED: 3,
    STATUS_INVALID_CONTROL_MODE_CHANGE: 4,
    STATUS_INVALID_REQUEST: 5,
    STATUS_ALREADY_MANUAL: 6,
    STATUS_ALREADY_AUTO: 7,
    STATUS_FEATURE_NOT_ENABLED: 8,
};
export function getModeControlStatusDescription(code) {
    switch (code) {
        case MODE_CONTROL_STATUS.MANUAL: return "Mode set to MANUAL";
        case MODE_CONTROL_STATUS.AUTO: return "Mode set to AUTO";
        case MODE_CONTROL_STATUS.SCHEDULE: return "Mode set to SCHEDULE";
        case MODE_CONTROL_STATUS.STATUS_FAULT_BLOCKED: return "Blocked by an active fault";
        case MODE_CONTROL_STATUS.STATUS_INVALID_CONTROL_MODE_CHANGE: return "Invalid control mode change";
        case MODE_CONTROL_STATUS.STATUS_INVALID_REQUEST: return "Invalid request";
        case MODE_CONTROL_STATUS.STATUS_ALREADY_MANUAL: return "Mode already MANUAL";
        case MODE_CONTROL_STATUS.STATUS_ALREADY_AUTO: return "Mode already AUTO";
        case MODE_CONTROL_STATUS.STATUS_FEATURE_NOT_ENABLED: return "Feature not enabled";
        default: return "Unknown mode control status";
    }
}
const MODE_CONTROL_CODE_TO_MODE = {
    [MODE_CONTROL_STATUS.MANUAL]: "MANUAL",
    [MODE_CONTROL_STATUS.AUTO]: "AUTO",
    [MODE_CONTROL_STATUS.SCHEDULE]: "SCHEDULE",
};
// True only for 0/1/2 — the codes that represent an actual mode, not a rejection reason.
export function isModeControlStateCode(code) {
    return code === 0 || code === 1 || code === 2;
}
/** Maps a MODE_CHANGE_ACK code (0/1/2) to the motors.mode enum value; null for rejection codes. */
export function modeControlCodeToMode(code) {
    return MODE_CONTROL_CODE_TO_MODE[code] ?? null;
}
/** Inverse of modeControlCodeToMode — used to build the T:2 publish payload. */
export function modeToControlCode(mode) {
    if (mode === "MANUAL")
        return 0;
    if (mode === "AUTO")
        return 1;
    return 2;
}
export function getPacketDescription(code) {
    switch (code) {
        // ACK TYPES
        case 11: return "Live Data Packet";
        case 31: return "Motor Control Acknowledgement";
        case 32: return "Mode Change Acknowledgement";
        case 33: return "Scheduling Acknowledgement";
        case 34: return "Calibration Acknowledgement";
        case 35: return "Live Data Request Acknowledgement";
        case 36: return "Config Data Request Acknowledgement";
        case 37: return "Scheduling Data Request Acknowledgement";
        case 38: return "Power Info Request Acknowledgement";
        case 39: return "Device Info Acknowledgement";
        case 40: return "Heartbeat Signal";
        // REQUEST TYPES
        case 1: return "Motor Control Request";
        case 2: return "Mode Change Request";
        case 3: return "Scheduling Request";
        case 4: return "Calibration Request";
        case 5: return "Live Data Request";
        case 6: return "Config Data Request";
        case 7: return "Scheduling Data Request";
        case 8: return "Power Info Request";
        case 10: return "Device Info Request";
        default:
            return "Unknown Packet Type";
    }
}
export const signalQuality = (code) => {
    if (code >= 2 && code <= 9)
        return "Marginal strength";
    if (code >= 10 && code <= 14)
        return "OK strength";
    if (code >= 15 && code <= 19)
        return "Good strength";
    if (code >= 20 && code <= 40)
        return "Excellent strength";
    return "Invalid signal code";
};
export function getValidStrength(value) {
    const isValid = value >= 2 && value <= 40;
    return {
        strength: isValid ? value : 0,
        status: (isValid ? "ACTIVE" : "INACTIVE"),
    };
}
export function getValidNetwork(value) {
    if (value === 2)
        return "2G";
    if (value === 4)
        return "4G";
    return "Unknown";
}
