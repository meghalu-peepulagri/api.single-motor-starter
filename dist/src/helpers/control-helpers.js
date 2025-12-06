export function lastOn(code) {
    switch (code) {
        case 0: return "AUTO";
        case 1: return "MANUAL";
        default: return "Unknown";
    }
}
export function lastOff(code) {
    switch (code) {
        case 0: return "AUTO";
        case 1: return "MANUAL";
        default: return "Unknown";
    }
}
export function controlMode(code) {
    switch (code) {
        case 0: return "AUTO";
        case 1: return "MANUAL";
        default: return "Unknown";
    }
}
export function motorState(code) {
    switch (code) {
        case 0: return "OFF";
        case 1: return "ON";
        default: return "Unknown";
    }
}
