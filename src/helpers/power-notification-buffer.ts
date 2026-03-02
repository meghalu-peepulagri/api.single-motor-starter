import { sendUserNotification } from "../services/fcm/fcm-service.js";
import { NOTIFICATION_ACTION_KEYS } from "./notification-action-keys.js";
import { logger } from "../utils/logger.js";

interface BufferedPowerNotification {
  pumpName: string;
  powerState: number; // 1 = restored, 0 = loss
  motorId: number;
  starterId: number;
}

interface UserPowerBuffer {
  userId: number;
  notifications: BufferedPowerNotification[];
  timer: ReturnType<typeof setTimeout>;
}

const DEBOUNCE_MS = 5000; // 5 seconds window to batch power notifications

const powerNotificationBuffer = new Map<number, UserPowerBuffer>();

export function bufferPowerNotification(
  userId: number,
  pumpName: string,
  powerState: number,
  motorId: number,
  starterId: number
) {
  const entry: BufferedPowerNotification = { pumpName, powerState, motorId, starterId };

  const existing = powerNotificationBuffer.get(userId);

  if (existing) {
    // Clear existing timer and reset it
    clearTimeout(existing.timer);
    existing.notifications.push(entry);
    existing.timer = setTimeout(() => flushPowerNotifications(userId), DEBOUNCE_MS);
  } else {
    const timer = setTimeout(() => flushPowerNotifications(userId), DEBOUNCE_MS);
    powerNotificationBuffer.set(userId, {
      userId,
      notifications: [entry],
      timer,
    });
  }
}

async function flushPowerNotifications(userId: number) {
  const buffer = powerNotificationBuffer.get(userId);
  if (!buffer || buffer.notifications.length === 0) {
    powerNotificationBuffer.delete(userId);
    return;
  }

  powerNotificationBuffer.delete(userId);

  try {
    const { notifications } = buffer;

    // Group by power state
    const restored = notifications.filter(n => n.powerState === 1);
    const lost = notifications.filter(n => n.powerState === 0);

    // Use the first notification's starterId and motorId for the FCM data payload
    const firstNotification = notifications[0];

    if (restored.length > 0) {
      const pumpNames = restored.map(n => n.pumpName).join(", ");
      const title = `Power Restored at ${pumpNames}`;
      const message = `Power has been restored at ${pumpNames}`;
      await sendUserNotification(userId, title, message, firstNotification.motorId, firstNotification.starterId, NOTIFICATION_ACTION_KEYS.INFORMATION);
    }

    if (lost.length > 0) {
      const pumpNames = lost.map(n => n.pumpName).join(", ");
      const title = `Power Loss at ${pumpNames}`;
      const message = `Power loss detected at ${pumpNames}`;
      await sendUserNotification(userId, title, message, firstNotification.motorId, firstNotification.starterId, NOTIFICATION_ACTION_KEYS.INFORMATION);
    }
  } catch (error) {
    logger.error("Error sending batched power notification", error);
  }
}
