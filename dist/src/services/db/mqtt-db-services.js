import { eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { alertsFaults } from "../../database/schemas/alerts-faults.js";
import { deviceTemperature } from "../../database/schemas/device-temperature.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { controlMode } from "../../helpers/control-helpers.js";
import { extractPreviousData, prepareMotorModeControlNotificationData, prepareMotorStateControlNotificationData } from "../../helpers/motor-helper.js";
import { liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { getValidNetwork, getValidStrength } from "../../helpers/packet-types-helper.js";
import { logger } from "../../utils/logger.js";
import { sendUserNotification } from "../fcm/fcm-service.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { ActivityService } from "./activity-service.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { trackDeviceRunTime, trackMotorRunTime } from "./motor-services.js";
import { updateLatestStarterSettings, updateLatestStarterSettingsFlc } from "./settings-services.js";
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
        case "CALIBRATION_ACK":
            await adminConfigDataRequestAckHandler(payload, topic);
            break;
        case "DEVICE_SERIAL_NUMBER_ALLOCATION_ACK":
            await deviceSerialNumberAllocationAckHandler(payload, topic);
            break;
        case "TEMPERATURE_THRESHOLD_SETTING":
            await adminConfigDataRequestAckHandler(payload, topic);
            break;
        default:
            return null;
    }
}
const VALID_MODES = ["AUTO", "MANUAL"];
export async function updateStates(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp, avg_current } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by } = extractPreviousData(previousData, motor_id);
    if (!starter_id)
        return null;
    const isInTestRun = await getSingleRecordByMultipleColumnValues(motors, ["starter_id", "id", "test_run_status"], ["=", "=", "="], [starter_id, motor_id, "PROCESSING"], ["test_run_status"]);
    if (isInTestRun && isInTestRun.test_run_status === "PROCESSING")
        await updateLatestStarterSettingsFlc(starter_id, avg_current);
    try {
        const notificationData = await db.transaction(async (trx) => {
            await saveSingleRecord(starterBoxParameters, { ...insertedData, payload_version: String(insertedData.payload_version), group_id: String(insertedData.group_id), temperature: temp }, trx);
            await saveSingleRecord(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);
            const starterBoxUpdates = {};
            let trackPowerChange = false;
            if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
                starterBoxUpdates.power = power_present;
                trackPowerChange = true;
            }
            if (temp !== null && temp !== undefined) {
                starterBoxUpdates.temperature = temp;
            }
            if (Object.keys(starterBoxUpdates).length > 0) {
                await updateRecordByIdWithTrx(starterBoxes, starter_id, starterBoxUpdates, trx);
                if (trackPowerChange) {
                    await trackDeviceRunTime({
                        starter_id, motor_id, location_id: locationId, previous_power_state: power,
                        new_power_state: power_present, motor_state, mode_description, time_stamp
                    }, trx);
                }
            }
            if (motor_id) {
                const updateData = {};
                let shouldUpdateMotor = false;
                if (typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1)) {
                    updateData.state = motor_state;
                    shouldUpdateMotor = true;
                }
                if (VALID_MODES.includes(mode_description) && mode_description !== prevMode) {
                    updateData.mode = mode_description;
                    shouldUpdateMotor = true;
                }
                if (shouldUpdateMotor) {
                    await updateRecordByIdWithTrx(motors, motor_id, updateData, trx);
                }
                const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
                const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
                const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
                if (shouldTrackMotorRuntime) {
                    await trackMotorRunTime({
                        starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: updateData.state ?? prevState,
                        mode_description, time_stamp, previous_power_state: power, new_power_state: power_present
                    }, trx);
                }
                if (created_by) {
                    await ActivityService.writeMotorSyncLogs(created_by, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: mode_description }, trx, starter_id);
                }
            }
            const alertsFaultsRecord = {
                starter_id, motor_id: motor_id || null, user_id: created_by || device_created_by, alert_code: alert_code ? Number(alert_code) : null,
                alert_description: alert_description ? String(alert_description) : null, fault_code: fault ? Number(fault) : null,
                fault_description: fault_description ? String(fault_description) : null, timestamp: new Date(time_stamp)
            };
            if (alert_code || fault) {
                await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
            }
            // Only prepare notifications when the respective value actually changed
            const hasStateChanged = typeof motor_state === "number" && motor_state !== prevState;
            const hasModeChanged = mode_description && mode_description !== prevMode;
            const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, motor_state, mode_description, starter_id) : null;
            const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, mode_description, starter_id) : null;
            const pumpName = motor.alias_name === undefined || motor.alias_name === null ? motor.name : motor.alias_name;
            // Prepare alert and fault notifications only when they exist
            let notificationDataAlert = null;
            let notificationDataFault = null;
            if (created_by && alert_description && motor_id && alert_code !== 0) {
                notificationDataAlert = {
                    userId: created_by, title: `${pumpName} Alert Detected`,
                    message: alert_description, motorId: motor_id, starter_id: starter_id
                };
            }
            if (fault_description && created_by && motor_id && fault !== 0) {
                notificationDataFault = {
                    userId: created_by, title: `${pumpName} Fault Detected`,
                    message: fault_description, motorId: motor_id, starter_id: starter_id
                };
            }
            const notificationData = { notificationDataState, notificationDataMode, notificationDataAlert, notificationDataFault };
            return notificationData;
        });
        // Send notification after transaction completes
        // state notification
        if (notificationData.notificationDataState) {
            const stateNotoificatioData = notificationData.notificationDataState;
            await sendUserNotification(stateNotoificatioData.userId, stateNotoificatioData.title, stateNotoificatioData.message, stateNotoificatioData.motorId, stateNotoificatioData.starterId);
        }
        // mode notification
        if (notificationData.notificationDataMode) {
            const modeNotificationData = notificationData.notificationDataMode;
            await sendUserNotification(modeNotificationData.userId, modeNotificationData.title, modeNotificationData.message, modeNotificationData.motorId, modeNotificationData.starterId);
        }
        // alert notification
        if (notificationData.notificationDataAlert) {
            const alertNotificationData = notificationData.notificationDataAlert;
            await sendUserNotification(alertNotificationData.userId, alertNotificationData.title, alertNotificationData.message, alertNotificationData.motorId, alertNotificationData.starter_id);
        }
        // fault notification
        if (notificationData.notificationDataFault) {
            const faultNotificationData = notificationData.notificationDataFault;
            await sendUserNotification(faultNotificationData.userId, faultNotificationData.title, faultNotificationData.message, faultNotificationData.motorId, faultNotificationData.starter_id);
        }
    }
    catch (error) {
        console.error("Error updating states in live data ack Go1:", error);
        throw error;
    }
}
export async function updateDevicePowerAndMotorStateToON(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp, avg_current } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by } = extractPreviousData(previousData, motor_id);
    if (!starter_id || !motor_id)
        return null;
    const isInTestRun = await getSingleRecordByMultipleColumnValues(motors, ["starter_id", "id", "test_run_status"], ["=", "=", "="], [starter_id, motor_id, "PROCESSING"], ["test_run_status"]);
    if (isInTestRun && isInTestRun.test_run_status === "PROCESSING")
        await updateLatestStarterSettingsFlc(starter_id, avg_current);
    const notificationData = await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, { ...insertedData, payload_version: String(insertedData.payload_version), group_id: String(insertedData.group_id), temperature: temp }, trx);
        await saveSingleRecord(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);
        const starterBoxUpdates = {};
        let trackPowerChange = false;
        if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
            starterBoxUpdates.power = power_present;
            trackPowerChange = true;
        }
        if (temp !== null && temp !== undefined) {
            starterBoxUpdates.temperature = temp;
        }
        if (Object.keys(starterBoxUpdates).length > 0) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, starterBoxUpdates, trx);
            if (trackPowerChange) {
                await trackDeviceRunTime({
                    starter_id, motor_id, location_id: locationId, previous_power_state: power,
                    new_power_state: power_present, motor_state, mode_description, time_stamp
                }, trx);
            }
        }
        if (motor_id) {
            const updateData = {};
            let shouldUpdateMotor = false;
            if (typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1)) {
                updateData.state = motor_state;
                shouldUpdateMotor = true;
            }
            if (VALID_MODES.includes(mode_description) && mode_description !== prevMode) {
                updateData.mode = mode_description;
                shouldUpdateMotor = true;
            }
            if (shouldUpdateMotor) {
                await updateRecordByIdWithTrx(motors, motor_id, updateData, trx);
            }
            if (created_by) {
                await ActivityService.writeMotorSyncLogs(created_by, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: mode_description }, trx, starter_id);
            }
        }
        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
        const hasStateChanged = typeof motor_state === "number" && motor_state !== prevState;
        const hasModeChanged = mode_description && mode_description !== prevMode;
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        if (shouldTrackMotorRuntime) {
            await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
        }
        const alertsFaultsRecord = {
            starter_id, motor_id: motor_id || null, user_id: created_by || null, alert_code: alert_code ? Number(alert_code) : null,
            alert_description: alert_description ? String(alert_description) : null, fault_code: fault ? Number(fault) : null,
            fault_description: fault_description ? String(fault_description) : null, timestamp: new Date(time_stamp)
        };
        if (alert_code || fault) {
            await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
        }
        const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, motor_state, mode_description, starter_id) : null;
        const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, mode_description, starter_id) : null;
        return { notificationDataState, notificationDataMode };
    });
    if (notificationData.notificationDataState) {
        await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
    }
    if (notificationData.notificationDataMode) {
        await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
    }
}
export async function updateDevicePowerONAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by } = extractPreviousData(previousData, motor_id);
    if (!starter_id || !motor_id)
        return null;
    const notificationData = await db.transaction(async (trx) => {
        await saveSingleRecord(starterBoxParameters, { ...insertedData, payload_version: String(insertedData.payload_version), group_id: String(insertedData.group_id), temperature: temp }, trx);
        await saveSingleRecord(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);
        const starterBoxUpdates = {};
        let trackPowerChange = false;
        if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
            starterBoxUpdates.power = power_present;
            trackPowerChange = true;
        }
        if (temp !== null && temp !== undefined) {
            starterBoxUpdates.temperature = temp;
        }
        if (Object.keys(starterBoxUpdates).length > 0) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, starterBoxUpdates, trx);
            if (trackPowerChange) {
                await trackDeviceRunTime({
                    starter_id, motor_id, location_id: locationId, previous_power_state: power,
                    new_power_state: power_present, motor_state, mode_description, time_stamp
                }, trx);
            }
        }
        if (motor_state !== prevState) {
            if (motor_state === 0 || motor_state === 1) {
                await updateRecordByIdWithTrx(motors, motor_id, { state: motor_state }, trx);
            }
        }
        if (created_by) {
            await ActivityService.writeMotorSyncLogs(created_by, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: prevMode }, trx, starter_id);
        }
        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
        const hasStateChanged = typeof motor_state === "number" && motor_state !== prevState;
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        if (shouldTrackMotorRuntime) {
            await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
        }
        const alertsFaultsRecord = {
            starter_id, motor_id: motor_id || null, user_id: created_by || device_created_by, alert_code: alert_code ? Number(alert_code) : null,
            alert_description: alert_description ? String(alert_description) : null, fault_code: fault ? Number(fault) : null,
            fault_description: fault_description ? String(fault_description) : null, timestamp: new Date(time_stamp)
        };
        if (alert_code || fault) {
            await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
        }
        const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, motor_state, mode_description, starter_id) : null;
        return { notificationDataState };
    });
    if (notificationData.notificationDataState) {
        await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
    }
}
export async function updateDevicePowerAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by } = extractPreviousData(previousData, motor_id);
    if (!starter_id || !motor_id)
        return null;
    const notificationData = await db.transaction(async (trx) => {
        await saveSingleRecord(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);
        const starterBoxUpdates = {};
        let trackPowerChange = false;
        if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
            starterBoxUpdates.power = power_present;
            trackPowerChange = true;
        }
        if (temp !== null && temp !== undefined) {
            starterBoxUpdates.temperature = temp;
        }
        if (Object.keys(starterBoxUpdates).length > 0) {
            await updateRecordByIdWithTrx(starterBoxes, starter_id, starterBoxUpdates, trx);
            if (trackPowerChange) {
                await trackDeviceRunTime({
                    starter_id, motor_id, location_id: locationId, previous_power_state: power,
                    new_power_state: power_present, motor_state, mode_description, time_stamp
                }, trx);
            }
        }
        if (VALID_MODES.includes(mode_description) && mode_description !== prevMode && motor_id) {
            await updateRecordByIdWithTrx(motors, motor_id, { mode: mode_description }, trx);
        }
        if (created_by) {
            await ActivityService.writeMotorSyncLogs(created_by, motor_id, { mode: prevMode }, { mode: mode_description }, trx, starter_id);
        }
        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        if (shouldTrackMotorRuntime) {
            await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
        }
        const alertsFaultsRecord = {
            starter_id, motor_id: motor_id || null, user_id: created_by || null, alert_code: alert_code ? Number(alert_code) : null,
            alert_description: alert_description ? String(alert_description) : null, fault_code: fault ? Number(fault) : null,
            fault_description: fault_description ? String(fault_description) : null, timestamp: new Date(time_stamp)
        };
        if (alert_code || fault) {
            await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
        }
        const hasModeChanged = mode_description && mode_description !== prevMode;
        const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, mode_description, starter_id) : null;
        return { notificationDataMode };
    });
    if (notificationData.notificationDataMode) {
        await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
    }
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
        const newState = message.D;
        const stateChanged = newState !== prevState;
        const notificationData = await db.transaction(async (trx) => {
            // Update motor state ONLY if changed
            if (stateChanged && (newState === 0 || newState === 1)) {
                await trx.update(motors).set({ state: newState, updated_at: new Date() }).where(eq(motors.id, motor.id));
                await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
            }
            // Always log ACK (changed or not)
            if (motor.created_by) {
                await ActivityService.writeMotorAckLogs(motor.created_by, motor.id, { state: prevState, mode: mode_description }, { state: newState, mode: mode_description }, "MOTOR_CONTROL_ACK", trx, starter_id);
            }
            return stateChanged ? prepareMotorStateControlNotificationData(motor, newState, mode_description, starter_id) : null;
        });
        // Send notification after transaction completes
        if (notificationData) {
            await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId, starter_id);
        }
    }
    catch (error) {
        logger.error("Error at motor control ack handler", error);
        console.error("Error at motor control ack handler", error);
        throw error;
    }
}
// Motor mode ack
export async function motorModeChangeAckHandler(message, topic) {
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        if (!validMac?.id || !validMac.motors.length) {
            logger.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        const mode = controlMode(message.D);
        const motor = validMac.motors[0];
        await db.transaction(async (trx) => {
            if (mode !== motor.mode) {
                if (mode == "MANUAL" || mode == "AUTO") {
                    await trx.update(motors).set({ mode: mode, updated_at: new Date() }).where(eq(motors.id, motor.id));
                }
            }
            if (motor.created_by) {
                await ActivityService.writeMotorAckLogs(motor.created_by, motor.id, { mode: motor.mode }, { mode: mode }, "MOTOR_MODE_ACK", trx, validMac.id);
            }
        });
        const modeChanged = mode !== motor.mode;
        const notificationData = modeChanged ? prepareMotorModeControlNotificationData(motor, mode, validMac.id) : null;
        if (notificationData) {
            await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId, notificationData.starterId);
        }
    }
    catch (error) {
        logger.error("Error at motor mode change ack handler", error);
        console.error("Error at motor mode change ack handler", error);
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
export async function deviceSerialNumberAllocationAckHandler(message, topic) {
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        if (!validMac?.id) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        if (message.D === 1)
            await updateRecordById(starterBoxes, validMac.id, { device_status: "DEPLOYED" });
    }
    catch (error) {
        console.error("Error at device serial number allocation ack handler:", error);
        throw error;
    }
}
export function publishData(preparedData, starterData) {
    if (!starterData)
        return null;
    const macOrPcb = starterData.device_status === 'READY' || starterData.device_status === 'TEST' ? starterData.mac_address : starterData.pcb_number;
    const topic = `peepul/${macOrPcb}/cmd`;
    const payload = JSON.stringify(preparedData);
    mqttServiceInstance.publish(topic, payload);
}
export async function adminConfigDataRequestAckHandler(message, topic) {
    try {
        const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
        if (!validMac?.id) {
            console.error(`Any starter found with given MAC [${topic}]`);
            return null;
        }
        ;
        if (message.D === undefined || message.D === null || !validMac.id || (message.D !== 0 && message.D !== 1)) {
            console.error(`Invalid message data in admin config ack [${message.D}]`);
            return null;
        }
        await updateLatestStarterSettings(validMac.id, message.D);
    }
    catch (error) {
        console.error("Error at admin config ack handler:", error);
        throw error;
    }
}
export const waitForAck = (identifiers, timeoutMs, validator) => {
    return new Promise((resolve) => {
        const mqttClient = mqttServiceInstance.getClient();
        if (!mqttClient || !mqttClient.connected) {
            console.error("MQTT client not connected");
            resolve(false);
            return;
        }
        const validIdentifiers = identifiers.filter(Boolean);
        const topics = validIdentifiers.map((id) => `peepul/${id}/status`);
        let settled = false;
        const cleanup = () => {
            topics.forEach((t) => mqttClient.unsubscribe(t));
            mqttClient.removeListener("message", onMessage);
        };
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                cleanup();
                resolve(false);
            }
        }, timeoutMs);
        const onMessage = (receivedTopic, message) => {
            if (!topics.includes(receivedTopic))
                return;
            try {
                const payload = JSON.parse(message.toString());
                if (validator && !validator(payload))
                    return;
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    cleanup();
                    resolve(true);
                }
            }
            catch {
                // ignore invalid JSON
            }
        };
        topics.forEach((topic) => mqttClient.subscribe(topic));
        mqttClient.on("message", onMessage);
    });
};
