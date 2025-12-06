export function lastOn(code) {
    switch (code) {
        case 0: return "LOCAL+MANUAL";
        case 1: return "LOCAL+AUTO";
        case 2: return "REMOTE+MANUAL";
        case 3: return "REMOTE+AUTO";
        default: return "Unknown";
    }
}
export function lastOff(code) {
    switch (code) {
        case 0: return "LOCAL+MANUAL";
        case 1: return "LOCAL+AUTO";
        case 2: return "REMOTE+MANUAL";
        case 3: return "REMOTE+AUTO";
        case 4: return "POWER_OFF";
        case 5: return "FAULT";
        default: return "Unknown";
    }
}
export function controlMode(code) {
    switch (code) {
        case 0: return "LOCAL+MANUAL";
        case 1: return "LOCAL+AUTO";
        case 2: return "REMOTE+MANUAL";
        case 3: return "REMOTE+AUTO";
        default: return "Unknown";
    }
}
export function motorState(code) {
    switch (code) {
        case 0: return "OFF";
        case 1: return "ON";
        case 2: return "POWER NOT PRESENT";
        case 3: return "FAULT BLOCKED";
        case 4: return "INVALID CONTROL_MODE_CHANGE";
        case 5: return "INVALID REQUEST";
        case 6: return "ALREADY ON";
        case 7: return "ALREADY OFF";
        case 8: return "DEVICE NOT FOUND";
        case 9: return "INVALID MOTOR CONTROL MESSAGE";
        case 10: return "MOTOR CONTROLLING FAILED";
        default: return "Unknown";
    }
}
