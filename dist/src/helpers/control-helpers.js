export function lastOn(code) {
    switch (code) {
        case 0: return "None";
        case 1: return "Manual";
        case 2: return "Auto";
        case 3: return "Remote";
        case 4: return "Schedule";
        case 5: return "SMS";
        case 6: return "Auto to Manual";
        case 7: return "Power Off";
        case 8: return "Fault";
        case 9: return "Fault Retry";
        default: return "Invalid";
    }
}
export function lastOff(code) {
    switch (code) {
        case 0: return "None";
        case 1: return "Manual";
        case 2: return "Auto";
        case 3: return "Remote";
        case 4: return "Schedule";
        case 5: return "SMS";
        case 6: return "Auto to Manual";
        case 7: return "Power Off";
        case 8: return "Fault";
        case 9: return "Fault Retry";
        default: return "Invalid";
    }
}
export function controlMode(code) {
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
export function motorState(code) {
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
export function getFailureReason(code) {
    switch (code) {
        case 0:
            return "No Failure";
        case 1:
            return "Power Loss";
        case 2:
            return "Fault";
        case 3:
            return "Mode Change";
        case 4:
            return "Overlap";
        case 5:
            return "Invalid timings";
        default:
            return "Invalid failure reason";
    }
}
;
const faultCodes = {
    "0x01": { short: "Dry Run", detailed: "Dry Run Protection Detected - No water flow detected." },
    "0x02": { short: "Overload", detailed: "Overload Threshold Detected - Check pump load." },
    "0x04": { short: "Locked Rotor", detailed: "Locked Rotor Detected - Motor not rotating." },
    "0x08": { short: "Current Imbalance", detailed: "Current Imbalance Detected - Uneven current distribution detected." },
    "0x10": { short: "Frequent Start", detailed: "Frequent Start Detected - Too many start attempts." },
    "0x20": { short: "Phase Failure", detailed: "Phase Failure Detected - Check phase connections." },
    "0x40": { short: "Low Voltage", detailed: "Low Voltage Detected - Check power supply." },
    "0x80": { short: "High Voltage", detailed: "High Voltage Detected - Verify voltage levels." },
    "0x100": { short: "Voltage Imbalance", detailed: "Voltage Imbalance Detected - Uneven voltage detected across phases." },
    "0x200": { short: "Phase Reversal", detailed: "Phase Reversal Detected - Check phase wiring sequence." },
    "0x400": { short: "Frequency Deviation", detailed: "Frequency Deviation Detected - Check power frequency." },
    "0x1000": { short: "Output Phase", detailed: "Output Phase Fault Detected - Check output connections." },
};
// 4095 get all codes
const alertCodes = {
    "0x01": { short: "Dry Run", detailed: "Dry Run Alert - No water flow detected." },
    "0x02": { short: "Overload", detailed: "Overload Alert - Check pump load." },
    "0x04": { short: "Locked Rotor", detailed: "Locked Rotor Alert - Motor not rotating." },
    "0x08": { short: "Current Imbalance", detailed: "Current Imbalance Alert - Uneven current distribution detected." },
    "0x10": { short: "Frequent Start", detailed: "Frequent Start Alert - Too many start attempts." },
    "0x20": { short: "Phase Failure", detailed: "Phase Failure Alert - Check phase connections." },
    "0x40": { short: "Low Voltage", detailed: "Low Voltage Alert - Check power supply." },
    "0x80": { short: "High Voltage", detailed: "High Voltage Alert - Verify voltage levels." },
    "0x100": { short: "Voltage Imbalance", detailed: "Voltage Imbalance Alert - Uneven voltage detected across phases." },
    "0x200": { short: "Phase Reversal", detailed: "Phase Reversal Alert - Check phase wiring sequence." },
    "0x400": { short: "Frequency Deviation", detailed: "Frequency Deviation Alert - Check power frequency." },
    "0x1000": { short: "Output Phase", detailed: "Output Phase Alert - Check output connections." },
};
export function getFaultDescription(faultCode) {
    if (!faultCode || faultCode === 0)
        return "No Fault";
    const faults = [];
    for (const [hexCode, description] of Object.entries(faultCodes)) {
        const bit = Number.parseInt(hexCode, 16);
        if ((faultCode & bit) === bit) {
            faults.push(description);
        }
    }
    if (faults.length === 0)
        return "Unknown Fault";
    if (faults.length === 1)
        return faults[0].detailed;
    return `${faults.map(f => f.short).join(", ")} Faults Detected – Please check the motor.`;
}
export function getFaultNotificationMessage(faultCode) {
    if (!faultCode || faultCode === 0)
        return "No Fault";
    const faults = [];
    for (const [hexCode, description] of Object.entries(faultCodes)) {
        const bit = Number.parseInt(hexCode, 16);
        if ((faultCode & bit) === bit) {
            faults.push(description);
        }
    }
    if (faults.length === 0)
        return "Unknown Fault";
    if (faults.length === 1)
        return `${faults[0].short} Fault Detected`;
    return `${faults.map(f => f.short).join(", ")} Faults Detected`;
}
export function getAlertDescription(alertCode) {
    if (!alertCode || alertCode === 0)
        return "No Alert";
    const alerts = [];
    for (const [hexCode, description] of Object.entries(alertCodes)) {
        const bit = Number.parseInt(hexCode, 16);
        if ((alertCode & bit) === bit) {
            alerts.push(description);
        }
    }
    if (alerts.length === 0)
        return "Unknown Alert";
    if (alerts.length === 1)
        return alerts[0].detailed;
    return `${alerts.map(a => a.short).join(", ")} Alerts Detected – Please check the motor.`;
}
export function getAlertNotificationMessage(alertCode) {
    if (!alertCode || alertCode === 0)
        return "No Alert";
    const alerts = [];
    for (const [hexCode, description] of Object.entries(alertCodes)) {
        const bit = Number.parseInt(hexCode, 16);
        if ((alertCode & bit) === bit) {
            alerts.push(description);
        }
    }
    if (alerts.length === 0)
        return "Unknown Alert";
    if (alerts.length === 1)
        return `${alerts[0].short} Alert Detected`;
    return `${alerts.map(a => a.short).join(", ")} Alerts Detected`;
}
