// Tag ids that never changed between the legacy (1.0) and device-spec (2.0) packet
// numbering — MOTOR_CONTROL/MODE_CHANGE/SCHEDULING_CREATE and their acks, plus the
// handful of request/ack ids neither renumbering touched.
const COMMON_REQUEST_TYPES = {
    MOTOR_CONTROL: 1,
    MODE_CHANGE: 2,
    SCHEDULING: 3, // TOPIC_SCHEDULING_CREATE
    CONFIG_DATA_REQUEST: 6,
    SCHEDULING_DATA_REQUEST: 7,
    POWER_INFO_REQUEST: 8,
    QUECTEL_FILE_DELETE: 11,
    QUECTEL_FILE_ADD: 12,
    UPDATE_STARTER_SETTINGS: 13
};
const COMMON_ACK_TYPES = {
    MOTOR_CONTROL_ACK: 31,
    MODE_CHANGE_ACK: 32,
    SCHEDULING_ACK: 33, // TOPIC_SCHEDULING_CREATE_ACK
    QUECTEL_FILE_DELETE_ACK: 42,
    QUECTEL_FILE_ADD_ACK: 43,
    ADMIN_CONFIG_DATA_REQUEST_ACK: 44
};
// payload_version "1.0" — legacy format, FROZEN (see payload-version-helper.ts). These
// boxes never received the device-spec renumbering and must keep sending/receiving the
// original tag ids forever.
export const REQUEST_TYPES_V1 = {
    ...COMMON_REQUEST_TYPES,
    CALIBRATION: 4,
    LIVE_DATA_REQUEST: 5,
    DEVICE_INFO_REQUEST: 10,
};
export const ACK_TYPES_V1 = {
    ...COMMON_ACK_TYPES,
    CALIBRATION_ACK: 34,
    LIVE_DATA_REQUEST_ACK: 35,
    CONFIG_DATA_REQUEST_ACK: 36,
    SCHEDULING_DATA_REQUEST_ACK: 37,
    POWER_INFO_REQUEST_ACK: 38,
    DEVICE_INFO_ACK: 39,
    HEART_BEAT: 40,
    LIVE_DATA: 41,
    DEVICE_SERIAL_NUMBER_ALLOCATION_ACK: 48,
    DEVICE_RESET_ACK: 52,
};
// payload_version "2.0" (single or dual motor) — the device spec's renumbered ids
// applied in the "renumber MQTT packet tag ids to the new device spec" commit.
export const REQUEST_TYPES_V2 = {
    ...COMMON_REQUEST_TYPES,
    CALIBRATION: 5, // renumbered 4 -> 5
    LIVE_DATA_REQUEST: 9, // renumbered 5 -> 9
    DEVICE_INFO_REQUEST: 15, // renumbered 10 -> 15
};
export const ACK_TYPES_V2 = {
    ...COMMON_ACK_TYPES,
    CALIBRATION_ACK: 35, // renumbered 34 -> 35
    LIVE_DATA_REQUEST_ACK: 39, // renumbered 35 -> 39
    DEVICE_SERIAL_NUMBER_ALLOCATION_ACK: 36, // renumbered 48 -> 36
    DEVICE_RESET_ACK: 38, // renumbered 52 -> 38
    DEVICE_INFO_ACK: 45, // renumbered 39 -> 45
    HEART_BEAT: 46, // renumbered 40 -> 46
    LIVE_DATA: 47, // renumbered 41 -> 47
};
// Kept as the default export for existing 2.0 call sites — REQUEST_TYPES/ACK_TYPES have
// always meant "the current device spec" values. New call sites that need to publish to
// or parse a specific box should use requestTypesFor()/ackTypesFor() instead.
export const REQUEST_TYPES = REQUEST_TYPES_V2;
export const ACK_TYPES = ACK_TYPES_V2;
/** Picks the tag-id table a box's firmware actually speaks, per its payload_version. */
export function requestTypesFor(version) {
    return version === "1.0" ? REQUEST_TYPES_V1 : REQUEST_TYPES_V2;
}
export function ackTypesFor(version) {
    return version === "1.0" ? ACK_TYPES_V1 : ACK_TYPES_V2;
}
// Several tag ids were reassigned between 1.0 and 2.0 (35, 36, 38, 39 mean different
// acks depending on version — see ACK_TYPES_V1/V2 above), so the sending box's
// payload_version must be known before a raw T value can be classified. Callers resolve
// it from the topic's mac/pcb (see getStarterPayloadVersion in starter-services.ts)
// before calling this. Defaults to "1.0", the safe direction for an unrecognised box.
export function findTopicACKByType(payload, version = "1.0") {
    const type = payload.T;
    if (version === "1.0") {
        switch (type) {
            case 31: return "MOTOR_CONTROL_ACK";
            case 32: return "MODE_CHANGE_ACK";
            case 33: return "SCHEDULING_ACK";
            case 34: return "CALIBRATION_ACK";
            case 35: return "LIVE_DATA_REQUEST_ACK";
            // 36 USER_CONFIG_DATA_REQUEST_ACK, 37 SCHEDULING_DATA_REQUEST_ACK and 38
            // POWER_INFO_REQUEST_ACK were never routed by selectTopicAck on 1.0 firmware either
            // — kept unrouted here rather than reused, since a 1.0 box was never given a
            // packet at those ids to actually send.
            case 39: return "DEVICE_INFO_ACK";
            case 40: return "HEART_BEAT";
            case 41: return "LIVE_DATA";
            case 42: return "QUECTEL_FILE_DELETE_ACK";
            case 43: return "QUECTEL_FILE_ADD_ACK";
            case 44: return "ADMIN_CONFIG_DATA_REQUEST_ACK";
            case 48: return "DEVICE_SERIAL_NUMBER_ALLOCATION_ACK";
            case 52: return "DEVICE_RESET_ACK";
            default: return "UNKNOWN";
        }
    }
    switch (type) {
        case 31: return "MOTOR_CONTROL_ACK";
        case 32: return "MODE_CHANGE_ACK";
        case 33: return "SCHEDULING_ACK";
        case 35: return "CALIBRATION_ACK";
        case 36: return "DEVICE_SERIAL_NUMBER_ALLOCATION_ACK";
        case 38: return "DEVICE_RESET_ACK";
        case 39: return "LIVE_DATA_REQUEST_ACK";
        case 42: return "QUECTEL_FILE_DELETE_ACK";
        case 43: return "QUECTEL_FILE_ADD_ACK";
        case 44: return "ADMIN_CONFIG_DATA_REQUEST_ACK";
        case 45: return "DEVICE_INFO_ACK";
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
