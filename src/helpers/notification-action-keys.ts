export const NOTIFICATION_ACTION_KEYS = {
  EMERGENCY: 1,   // Faults, critical errors
  ACTIONED: 2,    // Device/motor actions performed by user (remote or manual)
  INFORMATION: 3, // Live device/motor status updates (Online/Offline, Power, etc.)
} as const;

export type NotificationActionKey = typeof NOTIFICATION_ACTION_KEYS[keyof typeof NOTIFICATION_ACTION_KEYS];
