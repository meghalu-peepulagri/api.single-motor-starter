/**
 * Schedule-specific ACK tracker.
 *
 * Keyed by `${mac}:${seq}` — unlike the shared pendingAckMap (keyed only by mac),
 * this allows multiple concurrent schedule commands to the same device without
 * one overwriting the other.
 */

type AckType = "creation" | "update" | "query";

interface PendingScheduleAck {
  resolve: (success: boolean) => void;
  type: AckType;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const scheduleAckMap = new Map<string, PendingScheduleAck>();

/**
 * Register a pending ACK for a publish operation.
 * Returns a Promise that resolves true on ACK success, false on failure or timeout.
 */
export function registerScheduleAck(
  mac: string,
  seq: number,
  type: AckType,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const key = `${mac}:${seq}`;

    const timeoutHandle = setTimeout(() => {
      if (scheduleAckMap.has(key)) {
        scheduleAckMap.delete(key);
        resolve(false);
      }
    }, timeoutMs);

    scheduleAckMap.set(key, { resolve, type, timeoutHandle });
  });
}

/**
 * Called when an ACK arrives from the device.
 * Returns true if a pending entry was found and resolved, false if no match.
 */
export function resolveScheduleAck(mac: string, seq: number, success: boolean): boolean {
  const key = `${mac}:${seq}`;
  const pending = scheduleAckMap.get(key);
  if (!pending) return false;

  clearTimeout(pending.timeoutHandle);
  scheduleAckMap.delete(key);
  pending.resolve(success);
  return true;
}

/** For diagnostics — how many ACKs are currently pending */
export function pendingScheduleAckCount(): number {
  return scheduleAckMap.size;
}
