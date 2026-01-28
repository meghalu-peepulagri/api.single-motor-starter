import admin from "firebase-admin";
import { FirebaseMessagingError, getMessaging } from "firebase-admin/messaging";
import { deviceTokens, type DeviceTokensTable } from "../../database/schemas/device-tokens.js";
import { getSingleRecordByMultipleColumnValues, updateRecordById } from "../db/base-db-services.js";

admin.initializeApp({
  credential: admin.credential.cert(`${process.cwd()}/fcm-config.js`),
  projectId: "iot-stater",
});

async function sendNotificationForADevice(token: string, title: string, body: string, actionId: string) {
  try {
    const message = {
      notification: { title },
      data: { title, body, motor_id: actionId },
      token,
    };
    return await getMessaging().sendEach([message]);
  }
  catch (error: unknown) {
    try {
      if (error instanceof FirebaseMessagingError && error.code === "messaging/registration-token-not-registered") {
        await handleInvalidDeviceToken(token);
      }
    }
    catch (error: any) {
      console.error("Failed to mark token as inactive:", error.message);
      console.error(500, { error: error.message, stack: error.stack }, "Failed to mark token as inactive");
      throw error;
    }
    throw error;
  }
}

async function sendNotificationsForMultipleDevices(tokens: string[], title: string, body: string, actionId: string) {
  try {
    const message = {
      notification: { title },
      data: { title, body, motor_id: actionId },
      tokens, // Send to multiple devices
    };
    return await getMessaging().sendEachForMulticast(message);
  }
  catch (error: any) {
    console.error("Error at sending firebase notifications to multiple devices:", error);
    console.error(500, { error: error.message, stack: error.stack }, "Error at sending firebase notifications to multiple devices");
    throw error;
  }
}

async function handleInvalidDeviceToken(token: string) {
  const tokenRecord = await getSingleRecordByMultipleColumnValues<DeviceTokensTable>(deviceTokens, ["device_token"], ["="], [token]);

  if (tokenRecord) {
    await updateRecordById<DeviceTokensTable>(deviceTokens, tokenRecord.id, { status: "INACTIVE" });
  }
}


export { sendNotificationForADevice, sendNotificationsForMultipleDevices };



