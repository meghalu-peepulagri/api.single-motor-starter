// In-memory store: key → last notification sent timestamp
const notificationDebounceMap = new Map<string, number>();

const DEBOUNCE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // cleanup every 5 minutes

function buildKey(motorId: number, type: string, value: string | number): string {
  return `${motorId}:${type}:${value}`;
}

/**
 * Returns true if the notification should be SENT (not debounced).
 * Returns false if it was recently sent and should be SKIPPED.
 */
export function shouldSendNotification(
  motorId: number,
  type: "state" | "mode" | "alert" | "fault",
  value: string | number
): boolean {
  const key = buildKey(motorId, type, value);
  const now = Date.now();
  const lastSentAt = notificationDebounceMap.get(key);

  if (lastSentAt && (now - lastSentAt) < DEBOUNCE_INTERVAL_MS) {
    return false;
  }

  notificationDebounceMap.set(key, now);
  return true;
}

// Periodic cleanup of expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of notificationDebounceMap) {
    if (now - timestamp > DEBOUNCE_INTERVAL_MS) {
      notificationDebounceMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
