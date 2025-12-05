
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
} as const;


export const ACK_TYPES = {
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
  LIVE_DATA: 11,
} as const;



export function getPacketDescription(code: number): string {
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
