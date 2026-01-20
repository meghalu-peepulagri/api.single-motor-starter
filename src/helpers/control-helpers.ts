export function lastOn(code: number) {
  switch (code) {
    case 0: return "MANUAL";
    case 1: return "AUTO";
    default: return "Unknown";
  }
}

export function lastOff(code: number) {
  switch (code) {
    case 0: return "MANUAL";
    case 1: return "AUTO";
    case 2: return "Power Off";
    case 3: return "Fault";
    default: return "Unknown";
  }
}

export function controlMode(code: number) {
  switch (code) {
    case 0:
      return "MANUAL";
    case 1:
      return "AUTO";
    case 2:
      return "ALREADY AUTO";
    case 3:
      return "ALREADY MANUAL";
    case 4:
      return "INVALID REQUEST";
    case 5:
      return "FEATURE NOT ENABLED";
    default:
      return "Unknown mode";
  }
}

export function motorState(code: number) {
  switch (code) {
    case 0: return "OFF";
    case 1: return "ON";
    case 2: return "POWER NOT PRESENT";
    case 3: return "FAULT BLOCKED";
    case 4: return "INVALID CONTROL MODE CHANGE";
    case 5: return "INVALID REQUEST";
    case 6: return "ALREADY ON";
    case 7: return "ALREADY OFF";
    case 8: return "FEATURE NOT ENABLED";
    default: return "Unknown state";
  }
}

const faultCodes = {
  "0x01": "Dry Run Fault",
  "0x02": "Overload Fault",
  "0x04": "Locked Rotor Fault",
  "0x08": "Current Imbalance Fault",
  "0x10": "Frequent Start Fault",
  "0x20": "Phase Failure Fault",
  "0x40": "Low Voltage Fault",
  "0x80": "High Voltage Fault",
  "0x100": "Voltage Imbalance Fault",
  "0x200": "Phase Reversal Fault",
  "0x400": "Frequency deviation Fault",
  "0x1000": "Output phase Fault",
};
// 4095 get all codes
const alertCodes = {
  "0x01": "Dry Run Alert",
  "0x02": "Overload Alert",
  "0x04": "Locked Rotor Alert",
  "0x08": "Current Imbalance Alert",
  "0x10": "Frequent Start Alert",
  "0x20": "Phase Failure Alert",
  "0x40": "Low Voltage Alert",
  "0x80": "High Voltage Alert",
  "0x100": "Voltage Imbalance Alert",
  "0x200": "Phase Reversal Alert",
  "0x400": "Frequency deviation Alert",
  "0x1000": "Output phase Alert",
};

export function getFaultDescription(faultCode: number) {
  if (!faultCode || faultCode === 0)
    return "No Fault";
  const faults: any[] = [];
  for (const [hexCode, description] of Object.entries(faultCodes)) {
    const bit = Number.parseInt(hexCode, 16);
    if ((faultCode & bit) === bit) {
      faults.push(description);
    }
  }
  return faults.length > 0 ? faults.join(", ") : "Unknown Fault";
}

export function getAlertDescription(alertCode: number) {
  if (!alertCode || alertCode === 0)
    return "No Alert";
  const alerts: any[] = [];
  for (const [hexCode, description] of Object.entries(alertCodes)) {
    const bit = Number.parseInt(hexCode, 16);
    if ((alertCode & bit) === bit) {
      alerts.push(description);
    }
  }
  return alerts.length > 0 ? alerts.join(", ") : "Unknown Alert";
}