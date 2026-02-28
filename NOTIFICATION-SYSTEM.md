# Notification System Documentation

## Overview

This application uses **Firebase Cloud Messaging (FCM)** to send push notifications to users' mobile devices. Notifications are triggered by motor state changes, mode changes, alerts, and faults — either from user actions (API) or from MQTT messages received from hardware devices.

---

## Core Function: `sendUserNotification`

**File:** [fcm-service.ts](src/services/fcm/fcm-service.ts)

```typescript
sendUserNotification(userId: number, title: string, message: string, id: number, starterId: number)
```

### Parameters

| Parameter    | Type     | Description                                      |
|-------------|----------|--------------------------------------------------|
| `userId`    | `number` | The user who will receive the notification        |
| `title`     | `string` | Notification title (shown in device notification bar) |
| `message`   | `string` | Notification body/message content                 |
| `id`        | `number` | Motor ID (sent as `motor_id` in FCM data payload) |
| `starterId` | `number` | Starter/device ID (sent as `starter_id` in data payload) |

### How It Works

1. Fetches all **ACTIVE** device tokens for the given `userId` from the `device_tokens` table
2. If no tokens found → returns silently (no notification sent)
3. If **1 token** → calls `sendNotificationForADevice()`
4. If **multiple tokens** → calls `sendNotificationsForMultipleDevices()` (multicast)

### FCM Payload Structure

```json
{
  "notification": { "title": "<title>" },
  "data": {
    "title": "<title>",
    "body": "<message>",
    "motor_id": "<motor id>",
    "starter_id": "<starter id>"
  },
  "token": "<device fcm token>"
}
```

### Error Handling

- If a device token is **no longer registered** with Firebase (`messaging/registration-token-not-registered`), the token is automatically marked as `INACTIVE` in the database via `handleInvalidDeviceToken()`.

---

## Notification Types

| Type       | Title Format                                                        | Message Format                                              |
|-----------|---------------------------------------------------------------------|-------------------------------------------------------------|
| **State**  | `Pump {name} state turned ON/OFF with mode {mode}`                 | `State updated to 'ON/OFF' with mode 'AUTO/MANUAL'`        |
| **Mode**   | `Pump {name} mode updated to from {oldMode} to {newMode}`         | `Mode updated from '{oldMode}' to '{newMode}'`              |
| **Alert**  | `{pumpName} Alert Detected`                                        | Alert description text from alert code                      |
| **Fault**  | `{pumpName} Fault Detected`                                        | Fault description text from fault code                      |

> **Note:** `{name}` uses `motor.alias_name` if available, otherwise falls back to `starter_number`.

---

## All Call Sites (Where Notifications Are Sent)

### 1. User Updates Motor (API)

| Item       | Detail |
|-----------|--------|
| **File**   | [motor-handlers.ts:105-109](src/handlers/motor-handlers.ts#L105-L109) |
| **Function** | `updateMotorHandler` |
| **Trigger** | User updates motor state or mode via API endpoint |
| **Types Sent** | State notification, Mode notification |
| **Recipient** | `motor.created_by` (motor owner) |

---

### 2. MQTT Live Data — G01 (State/Mode/Alert/Fault Updates)

| Item       | Detail |
|-----------|--------|
| **File**   | [mqtt-db-services.ts:200-218](src/services/db/mqtt-db-services.ts#L200-L218) |
| **Function** | `updateStates` |
| **Trigger** | MQTT G01 topic — live data from device with state, mode, alert, or fault changes |
| **Types Sent** | State, Mode, Alert, Fault (each only if changed) |
| **Recipient** | `motor.created_by` |

**This is the most comprehensive notification point** — it handles all 4 notification types.

---

### 3. MQTT G02 — Device Power ON & Motor State ON

| Item       | Detail |
|-----------|--------|
| **File**   | [mqtt-db-services.ts:314-319](src/services/db/mqtt-db-services.ts#L314-L319) |
| **Function** | `updateDevicePowerAndMotorStateToON` |
| **Trigger** | Device powers on with motor already running |
| **Types Sent** | State notification, Mode notification |
| **Recipient** | `motor.created_by` |

---

### 4. MQTT G03 — Device Power ON & Motor State OFF

| Item       | Detail |
|-----------|--------|
| **File**   | [mqtt-db-services.ts:385](src/services/db/mqtt-db-services.ts#L385) |
| **Function** | `updateDevicePowerONAndMotorStateOFF` |
| **Trigger** | Device powers on but motor is off |
| **Types Sent** | State notification only |
| **Recipient** | `motor.created_by` |

---

### 5. MQTT G04 — Device Power OFF & Motor State OFF

| Item       | Detail |
|-----------|--------|
| **File**   | [mqtt-db-services.ts:448](src/services/db/mqtt-db-services.ts#L448) |
| **Function** | `updateDevicePowerAndMotorStateOFF` |
| **Trigger** | Device powers off completely |
| **Types Sent** | Mode notification only |
| **Recipient** | `motor.created_by` |

---

### 6. MQTT — Motor Control ACK

| Item       | Detail |
|-----------|--------|
| **File**   | [mqtt-db-services.ts:495](src/services/db/mqtt-db-services.ts#L495) |
| **Function** | `motorControlAckHandler` |
| **Trigger** | Device acknowledges a motor state change command |
| **Types Sent** | State notification (only if state actually changed) |
| **Recipient** | `motor.created_by` |

---

### 7. MQTT — Motor Mode Change ACK

| Item       | Detail |
|-----------|--------|
| **File**   | [mqtt-db-services.ts:531](src/services/db/mqtt-db-services.ts#L531) |
| **Function** | `motorModeChangeAckHandler` |
| **Trigger** | Device acknowledges a mode change command |
| **Types Sent** | Mode notification (only if mode actually changed) |
| **Recipient** | `motor.created_by` |

---

## Notification Data Preparation Helpers

**File:** [motor-helper.ts](src/helpers/motor-helper.ts)

### `prepareMotorStateControlNotificationData` (Line 196)

Builds notification data for state changes (ON/OFF). Returns `null` if `motor.created_by` is null/undefined.

### `prepareMotorModeControlNotificationData` (Line 222)

Builds notification data for mode changes (AUTO/MANUAL). Returns `null` if `motor.created_by` is null/undefined.

---

## Device Token Registration

**File:** [auth-handlers.ts:175-185](src/handlers/auth-handlers.ts#L175-L185)

Device FCM tokens are registered during **OTP verification** (login flow):
- If the user provides an `fcm_token` in the OTP verify request, it is saved to the `device_tokens` table
- Duplicate tokens for the same user are not re-saved
- Tokens are stored with `status = "ACTIVE"` by default

---

## Files NOT Sending Notifications

| File | Reason |
|------|--------|
| `motor-scheduling-handlers.ts` | Handles scheduling logic only — no notifications |
| `auth-handlers.ts` | Only registers device tokens, does not send notifications |
| `user-handlers.ts` | User profile operations — no notifications |

---

## Flow Diagram

```
┌─────────────────┐     ┌──────────────────┐
│  User API Call   │     │  MQTT Message     │
│ (motor update)   │     │ (G01/G02/G03/G04 │
└────────┬────────┘     │  /ACK topics)     │
         │              └────────┬──────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│  Prepare Notification Data              │
│  (prepareMotorStateControlNotification  │
│   prepareMotorModeControlNotification)  │
│  → userId, title, message, motorId,     │
│    starterId                            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  sendUserNotification()                 │
│  → Fetch active device tokens for user  │
└────────────────┬────────────────────────┘
                 │
          ┌──────┴──────┐
          │             │
          ▼             ▼
   ┌────────────┐ ┌──────────────────┐
   │ 1 token    │ │ Multiple tokens  │
   │ sendOne()  │ │ sendMulticast()  │
   └─────┬──────┘ └───────┬──────────┘
         │                │
         ▼                ▼
┌─────────────────────────────────────────┐
│  Firebase Cloud Messaging (FCM)         │
│  → Push notification to user's device(s)│
└─────────────────────────────────────────┘
```
