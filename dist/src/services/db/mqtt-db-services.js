import db from "../../database/configuration.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { controlMode } from "../../helpers/control-helpers.js";
import { liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { getValidNetwork, getValidStrength } from "../../helpers/packet-types-helper.js";
import { saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { getStarterByMacWithMotor } from "./starter-services.js";
// Live data
export async function saveLiveDataTopic(insertedData, groupId, previousData) {
    switch (groupId) {
        case "G01": //  Live data topic
            await updateStates(insertedData, previousData);
            break;
        case "G02":
            // Update Device power & motor state to ON
            await updateDevicePowerAndMotorStateToON(insertedData, previousData);
            break;
        case "G03":
            // Update Device power On & motor state to Off
            await updateDevicePowerONAndMotorStateOFF(insertedData, previousData);
            break;
        case "G04":
            await updateDevicePowerAndMotorStateOFF(insertedData, previousData);
            break;
        default:
            return null;
    }
}
export async function selectTopicAck(topicType, payload, topic) {
    switch (topicType) {
        case "LIVE_DATA":
            await liveDataHandler(payload, topic);
            break;
        case "MOTOR_CONTROL_ACK":
            await motorControlAckHandler(payload, topic);
            break;
        case "MODE_CHANGE_ACK":
            await motorModeChangeAckHandler(payload, topic);
            break;
        case "HEART_BEAT":
            await heartbeatHandler(payload, topic);
            break;
        default:
            return null;
    }
}
export async function updateStates(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;
    const { power, state, mode } = previousData;
    if (!starter_id)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        if (power_present !== power)
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: power_present }, trx);
        if (motor_id && motor_state !== state || mode_description !== mode)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
    });
}
export async function updateDevicePowerAndMotorStateToON(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;
    const { power, state, mode } = previousData;
    if (!starter_id || !motor_id || power_present !== 1)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        if (power_present !== power)
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: 1 }, trx);
        if (motor_id && motor_state !== state || mode_description !== mode)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
    });
}
export async function updateDevicePowerONAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state } = insertedData;
    const { power, state } = previousData;
    if (!starter_id || !motor_id || power_present !== 1)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        if (power_present !== power)
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: 1 }, trx);
        if (motor_id && motor_state !== state)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state }, trx);
    });
}
export async function updateDevicePowerAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, motor_state, mode_description, power_present } = insertedData;
    const { power, state, mode } = previousData;
    if (!starter_id || !motor_id)
        return null;
    await db.transaction(async (trx) => {
        if (power_present !== power)
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: power_present }, trx);
        if (motor_id && motor_state !== state || mode_description !== mode)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
    });
}
// Motor control ack
export async function motorControlAckHandler(message, topic) {
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        if (!validMac?.id || !validMac.motors.length) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        if (message.D !== validMac.motors[0].state)
            await updateRecordById(motors, validMac.motors[0].id, { state: message.D });
    }
    catch (error) {
        console.error("Error at motor control ack topic handler:", error);
        throw error;
    }
}
// Motor mode ack
export async function motorModeChangeAckHandler(message, topic) {
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        if (!validMac?.id || !validMac.motors.length) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        const mode = controlMode(message.D);
        if (mode !== validMac.motors[0].mode)
            await updateRecordById(motors, validMac.motors[0].id, { mode });
    }
    catch (error) {
        console.error("Error at motor control ack topic handler:", error);
        throw error;
    }
}
export async function heartbeatHandler(message, topic) {
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        if (!validMac?.id) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        const validStrength = getValidStrength(message.D.s_q);
        const validNetwork = getValidNetwork(message.D.nwt);
        if (validMac.signal_quality !== validStrength || validMac.network_type !== message.D.nwt)
            await updateRecordById(starterBoxes, validMac.id, { signal_quality: validStrength, network_type: validNetwork });
    }
    catch (error) {
        console.error("Error at heartbeat topic handler:", error);
        throw error;
    }
}
