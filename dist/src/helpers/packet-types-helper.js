export const REQUEST_TYPES = {
    MOTOR_CONTROL: 1,
    MODE_CHANGE: 2,
    SCHEDULING: 3,
    CALIBRATION: 4,
    LIVE_DATA_REQUEST: 5,
    CONFIG_DATA_REQUEST: 6,
    SCHEDULING_DATA_REQUEST: 7,
    POWER_INFO_REQUEST: 8,
    DEVICE_INFO_REQUEST: 10,
    QUECTEL_FILE_DELETE: 11,
    QUECTEL_FILE_ADD: 12,
    UPDATE_STARTER_SETTINGS: 13
};
export const ACK_TYPES = {
    LIVE_DATA: 41,
    MOTOR_CONTROL_ACK: 31,
    MODE_CHANGE_ACK: 32,
    SCHEDULING_ACK: 33,
    CALIBRATION_ACK: 34,
    LIVE_DATA_REQUEST_ACK: 35,
    CONFIG_DATA_REQUEST_ACK: 36,
    SCHEDULING_DATA_REQUEST_ACK: 37,
    POWER_INFO_REQUEST_ACK: 38,
    DEVICE_INFO_ACK: 39,
    HEART_BEAT: 40,
    QUECTEL_FILE_DELETE_ACK: 42,
    QUECTEL_FILE_ADD_ACK: 43,
    ADMIN_CONFIG_DATA_REQUEST_ACK: 44
};
export function findTopicACKByType(payload) {
    const type = payload.T;
    switch (type) {
        case 41: return "LIVE_DATA";
        case 31: return "MOTOR_CONTROL_ACK";
        case 32: return "MODE_CHANGE_ACK";
        case 33: return "SCHEDULING_ACK";
        case 34: return "CALIBRATION_ACK";
        case 35: return "LIVE_DATA_REQUEST_ACK";
        case 36: return "USER_CONFIG_DATA_REQUEST_ACK";
        case 37: return "SCHEDULING_DATA_REQUEST_ACK";
        case 38: return "POWER_INFO_REQUEST_ACK";
        case 39: return "DEVICE_INFO_ACK";
        case 40: return "HEART_BEAT";
        case 42: return "QUECTEL_FILE_DELETE_ACK";
        case 43: return "QUECTEL_FILE_ADD_ACK";
        case 44: return "ADMIN_CONFIG_DATA_REQUEST_ACK";
        case 45: return "FOTA_REQUEST_ACK";
        case 46: return "FOTA_FILE_INFO_ACK";
        case 47: return "FOTA_INITIALIZATION_REQUEST_ACK";
        case 48: return "DEVICE_SERIAL_NUMBER_ALLOCATION_ACK";
        case 49: return "BOOT_MANIFEST_ACK";
        case 50: return "TEMPERATURE_THRESHOLD_SETTING";
        default: return "UNKNOWN";
    }
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
    if (code >= 20 && code <= 30)
        return "Excellent strength";
    return "Invalid signal code";
};
export function getValidStrength(value) {
    const isValid = value >= 2 && value <= 30;
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
