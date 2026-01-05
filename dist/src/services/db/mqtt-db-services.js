import db from "../../database/configuration.js";
import { alertsFaults } from "../../database/schemas/alerts-faults.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { controlMode } from "../../helpers/control-helpers.js";
import { extractPreviousData } from "../../helpers/motor-helper.js";
import { liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { getValidNetwork, getValidStrength } from "../../helpers/packet-types-helper.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { trackDeviceRunTime, trackMotorRunTime } from "./motor-services.js";
import { updateLatestStarterSettings } from "./settings-services.js";
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
        case "LIVE_DATA_REQUEST_ACK":
            await liveDataHandler(payload, topic);
            break;
        case "HEART_BEAT":
            await heartbeatHandler(payload, topic);
            break;
        case "ADMIN_CONFIG_DATA_REQUEST_ACK":
            await adminConfigDataRequestAckHandler(payload, topic);
            break;
        default:
            return null;
    }
}
export async function updateStates(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp } = insertedData;
    const { power, prevState, prevMode, locationId, created_by } = extractPreviousData(previousData, motor_id);
    if (!starter_id)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        if (power_present !== power) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: power_present }, trx);
            await trackDeviceRunTime({ starter_id, motor_id, location_id: locationId, previous_power_state: power, new_power_state: power_present, motor_state, mode_description, time_stamp });
        }
        const motorChanged = motor_id && (motor_state !== prevState || mode_description !== prevMode);
        if (motorChanged) {
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
        }
        if (motor_id && motor_state !== prevState || power_present !== power) {
            await trackMotorRunTime({
                starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp,
                previous_power_state: power, new_power_state: power_present
            });
        }
        if (alert_code && fault)
            await saveSingleRecord(alertsFaults, { starter_id, motor_id, user_id: created_by, alert_code, alert_description, fault_code: fault, fault_description, timestamp: new Date(time_stamp) }, trx);
    });
}
export async function updateDevicePowerAndMotorStateToON(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, time_stamp } = insertedData;
    const { power, prevState, prevMode, locationId } = extractPreviousData(previousData, motor_id);
    if (!starter_id || !motor_id)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        if (power_present !== power) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: power_present }, trx);
            await trackDeviceRunTime({ starter_id, motor_id, location_id: locationId, previous_power_state: power, new_power_state: power_present, motor_state, mode_description, time_stamp });
        }
        if (motor_state !== prevState || mode_description !== prevMode)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
        if (motor_state !== prevState || power_present !== power) {
            await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present });
        }
    });
}
export async function updateDevicePowerONAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, time_stamp } = insertedData;
    const { power, prevState, locationId } = extractPreviousData(previousData, motor_id);
    if (!starter_id || !motor_id)
        return null;
    await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, insertedData, trx);
        if (power_present !== power) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: power_present }, trx);
            await trackDeviceRunTime({ starter_id, motor_id, location_id: locationId, previous_power_state: power, new_power_state: power_present, motor_state, mode_description, time_stamp });
        }
        if (motor_state !== prevState)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state }, trx);
        if (motor_state !== prevState || power_present !== power) {
            await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present });
        }
    });
}
export async function updateDevicePowerAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, time_stamp } = insertedData;
    const { power, prevState, prevMode, locationId } = extractPreviousData(previousData, motor_id);
    if (!starter_id || !motor_id)
        return null;
    await db.transaction(async (trx) => {
        if (power_present !== power) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, { power: power_present }, trx);
            await trackDeviceRunTime({ starter_id, motor_id, location_id: locationId, previous_power_state: power, new_power_state: power_present, motor_state, mode_description, time_stamp });
        }
        if (motor_state !== prevState || mode_description !== prevMode)
            await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
        if (motor_state !== prevState || power_present !== power) {
            await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present });
        }
    });
}
// Motor control ack
export async function motorControlAckHandler(message, topic) {
    try {
        const macAddress = topic.split("/")[1];
        if (!macAddress) {
            console.error("Invalid topic format: MAC address not found");
            return;
        }
        const validMac = await getStarterByMacWithMotor(macAddress);
        if (!validMac?.id || !validMac.motors || validMac.motors.length === 0) {
            console.error(`No starter found with MAC address [${macAddress}] or no motors attached`);
            return;
        }
        const motor = validMac.motors[0];
        const starter_id = validMac.id;
        const motor_id = motor.id;
        const location_id = motor.location_id;
        const mode_description = motor.mode;
        const prevState = motor.state;
        const stateChanged = message.D !== prevState;
        if (stateChanged) {
            await db.transaction(async (trx) => {
                await updateRecordByIdWithTrx(motors, motor_id, { state: message.D }, trx);
                await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: message.D, mode_description });
            });
        }
    }
    catch (error) {
        console.error("Error in motor control ack handler:", error);
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
        const { strength, status } = getValidStrength(message.D.s_q);
        const validNetwork = getValidNetwork(message.D.nwt);
        if (validMac.signal_quality !== strength || validMac.network_type !== message.D.nwt)
            await updateRecordById(starterBoxes, validMac.id, { signal_quality: strength, network_type: validNetwork, status: status });
    }
    catch (error) {
        console.error("Error at heartbeat topic handler:", error);
        throw error;
    }
}
export function publishStarterSettings(preparedData, pcbNumber) {
    if (!pcbNumber)
        return null;
    const topic = `peepul/${pcbNumber}/cmd`;
    mqttServiceInstance.publish(topic, JSON.stringify(preparedData));
}
export async function adminConfigDataRequestAckHandler(message, topic) {
    console.log('topic: ', topic);
    console.log('message: ', message);
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        console.log('validMac: ', validMac);
        if (!validMac?.id) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        if (message.D === undefined || message.D === null || !validMac.id || (message.D !== 0 && message.D !== 1)) {
            console.log('validMac.id: ', validMac.id);
            console.log('message.D: ', message.D);
            console.error(`Invalid message data in admin config ack [${message.D}]`);
            return null;
        }
        await updateLatestStarterSettings(validMac.id, message.D);
    }
    catch (error) {
        console.error("Error at heartbeat topic handler:", error);
        throw error;
    }
}
