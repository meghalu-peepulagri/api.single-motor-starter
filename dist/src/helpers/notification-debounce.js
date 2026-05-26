// In-memory store: key (motorId:type) → last sent value
const lastSentValueMap = new Map();
function buildKey(motorId, type) {
    return `${motorId}:${type}`;
}
/**
 * Returns true if the notification should be SENT (value differs from last sent).
 * Returns false if the current value is the same as the last sent value.
 */
export function shouldSendNotification(motorId, type, value) {
    const key = buildKey(motorId, type);
    const lastValue = lastSentValueMap.get(key);
    if (lastValue !== undefined && lastValue === value) {
        return false;
    }
    lastSentValueMap.set(key, value);
    return true;
}
