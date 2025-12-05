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
            await updateDevicePowerAndMotorStateToON(insertedData, insertedData.starter_id, insertedData.motor_id, insertedData.power, insertedData.motor_state);
            break;
        case "G03":
            // Update Device power On & motor state to Off
            await updateDevicePowerONAndMotorStateOFF(insertedData.starter_id, insertedData.motor_id, insertedData.power, insertedData.motor_state);
            break;
        case "G04":
            await updateDevicePowerAndMotorStateOFF(insertedData.starter_id, insertedData.motor_id, insertedData.power, insertedData.motor_state);
            break;
        default:
            return null;
    }
}
export async function updateDevicePowerAndMotorStateToON(insertedData, starterId, motorId, power, motorState) {
    console.log('insertedData: ', insertedData);
    if (!starterId || !motorId)
        return null;
    if (power === 1 || motorState === 1)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        await updateRecordByIdWithTrx(starterBoxes, starterId, { power: 1 }, trx);
        await updateRecordByIdWithTrx(motors, motorId, { motor_state: 1 }, trx);
    });
}
export async function updateDevicePowerONAndMotorStateOFF(starterId, motorId, power, motorState) {
    if (!starterId || !motorId)
        return null;
    if (power === 1 || motorState === 0)
        return null;
    await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(starterBoxes, starterId, { power: 1 }, trx);
        await updateRecordByIdWithTrx(motors, motorId, { motor_state: 0 }, trx);
    });
}
export async function updateDevicePowerAndMotorStateOFF(starterId, motorId, power, motorState) {
    if (!starterId || !motorId)
        return null;
    if (power === 0 || motorState === 0)
        return null;
    await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(starterBoxes, starterId, { power: 0 }, trx);
        await updateRecordByIdWithTrx(motors, motorId, { motor_state: 0 }, trx);
    });
}
