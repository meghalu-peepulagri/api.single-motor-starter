import admin from "firebase-admin";
import { FirebaseMessagingError, getMessaging } from "firebase-admin/messaging";
import { deviceTokens } from "../../database/schemas/device-tokens.js";
import { getSingleRecordByMultipleColumnValues, updateRecordById } from "../db/base-db-services.js";
admin.initializeApp({
    credential: admin.credential.cert(`${process.cwd()}/fcm-config.js`),
    projectId: "iot-stater",
});
async function sendNotificationForADevice(token, title, body, actionId) {
    try {
        const message = {
            notification: { title },
            data: { title, body, motor_id: actionId },
            token,
        };
        return await getMessaging().sendEach([message]);
    }
    catch (error) {
        try {
            if (error instanceof FirebaseMessagingError && error.code === "messaging/registration-token-not-registered") {
                await handleInvalidDeviceToken(token);
            }
        }
        catch (error) {
            console.error("Failed to mark token as inactive:", error.message);
            console.error(500, { error: error.message, stack: error.stack }, "Failed to mark token as inactive");
            throw error;
        }
        throw error;
    }
}
async function sendNotificationsForMultipleDevices(tokens, title, body, actionId) {
    try {
        const message = {
            notification: { title },
            data: { title, body, motor_id: actionId },
            tokens, // Send to multiple devices
        };
        return await getMessaging().sendEachForMulticast(message);
    }
    catch (error) {
        console.error("Error at sending firebase notifications to multiple devices:", error);
        console.error(500, { error: error.message, stack: error.stack }, "Error at sending firebase notifications to multiple devices");
        throw error;
    }
}
async function handleInvalidDeviceToken(token) {
    const tokenRecord = await getSingleRecordByMultipleColumnValues(deviceTokens, ["device_token"], ["="], [token]);
    if (tokenRecord) {
        await updateRecordById(deviceTokens, tokenRecord.id, { status: "INACTIVE" });
    }
}
export { sendNotificationForADevice, sendNotificationsForMultipleDevices };
