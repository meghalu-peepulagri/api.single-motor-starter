import db from "../../database/configuration.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";
export async function saveLiveDataTopic(insertedData, groupId) {
    switch (groupId) {
        case "G01": //  Live data topic
            await saveSingleRecord(starterBoxParameters, insertedData);
            break;
        case "G02":
            // Update Device power & motor state to ON
            await updateDevicePowerAndMotorStateToON(insertedData);
            break;
        case "G03":
            // Update Device power On & motor state to Off
            await updateDevicePowerONAndMotorStateOFF(insertedData);
            break;
        case "G04":
            await updateDevicePowerAndMotorStateOFF(insertedData);
            break;
        default:
            return null;
    }
}
export async function updateDevicePowerAndMotorStateToON(insertedData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;
    if (!starter_id || !motor_id || power_present !== 1)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: 1 }, trx);
        await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
    });
}
export async function updateDevicePowerONAndMotorStateOFF(insertedData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;
    if (!starter_id || !motor_id || power_present !== 1)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: 1 }, trx);
        await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state }, trx);
    });
}
export async function updateDevicePowerAndMotorStateOFF(insertedData) {
    const { starter_id, motor_id, motor_state, mode_description } = insertedData;
    if (!starter_id || !motor_id)
        return null;
    await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: 0 }, trx);
        await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
    });
}
