import { sendUserNotification } from "../services/fcm/fcm-service.js";
import { NOTIFICATION_ACTION_KEYS } from "./notification-action-keys.js";
import { logger } from "../utils/logger.js";

interface BufferedConnectivityNotification {
  pumpName: string;
  isOnline: boolean;
  motorId: number;
  starterId: number;
}

interface UserConnectivityBuffer {
  userId: number;
  notifications: BufferedConnectivityNotification[];
  timer: ReturnType<typeof setTimeout>;
}

const DEBOUNCE_MS = 5000; // 5 seconds window to batch connectivity notifications

const connectivityNotificationBuffer = new Map<number, UserConnectivityBuffer>();

export function bufferConnectivityNotification(
  userId: number,
  pumpName: string,
  isOnline: boolean,
  motorId: number,
  starterId: number
) {
  const entry: BufferedConnectivityNotification = { pumpName, isOnline, motorId, starterId };

  const existing = connectivityNotificationBuffer.get(userId);

  if (existing) {
    clearTimeout(existing.timer);
    existing.notifications.push(entry);
    existing.timer = setTimeout(() => flushConnectivityNotifications(userId), DEBOUNCE_MS);
  } else {
    const timer = setTimeout(() => flushConnectivityNotifications(userId), DEBOUNCE_MS);
    connectivityNotificationBuffer.set(userId, {
      userId,
      notifications: [entry],
      timer,
    });
  }
}

async function flushConnectivityNotifications(userId: number) {
  const buffer = connectivityNotificationBuffer.get(userId);
  if (!buffer || buffer.notifications.length === 0) {
    connectivityNotificationBuffer.delete(userId);
    return;
  }

  connectivityNotificationBuffer.delete(userId);

  try {
    const { notifications } = buffer;

    const online = notifications.filter(n => n.isOnline);
    const offline = notifications.filter(n => !n.isOnline);

    const firstNotification = notifications[0];

    if (online.length > 0) {
      const pumpNames = online.map(n => n.pumpName).join(", ");
      const title = `${pumpNames} is Back Online`;
      const message = `${pumpNames} is now connected and online`;
      await sendUserNotification(userId, title, message, firstNotification.motorId, firstNotification.starterId, NOTIFICATION_ACTION_KEYS.INFORMATION);
    }

    if (offline.length > 0) {
      const pumpNames = offline.map(n => n.pumpName).join(", ");
      const title = `${pumpNames} Offline`;
      const message = `${pumpNames} is offline - check power/SIM`;
      await sendUserNotification(userId, title, message, firstNotification.motorId, firstNotification.starterId, NOTIFICATION_ACTION_KEYS.INFORMATION);
    }
  } catch (error) {
    logger.error("Error sending batched connectivity notification", error);
  }
}
