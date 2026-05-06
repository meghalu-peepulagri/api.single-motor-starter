import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { alertsFaults } from "../../database/schemas/alerts-faults.js";
import { updateActualScheduleFields } from "./motor-schedules-services.js";
import { deviceTemperature } from "../../database/schemas/device-temperature.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { pendingAckMap } from "../../helpers/ack-tracker-hepler.js";
import { controlMode, getFaultNotificationMessage } from "../../helpers/control-helpers.js";
import { extractPreviousData, prepareMotorModeControlNotificationData, prepareMotorStateControlNotificationData } from "../../helpers/motor-helper.js";
import { getIdentifiersFromTopic, liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { shouldSendNotification } from "../../helpers/notification-debounce.js";
import { getValidNetwork, getValidStrength } from "../../helpers/packet-types-helper.js";
import { logger } from "../../utils/logger.js";
import { sendUserNotification } from "../fcm/fcm-service.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { ActivityService } from "./activity-service.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { getGatewayByIdentifier } from "./gateway-services.js";
import { hasMotorRunTimeRecord, trackDeviceRunTime, trackMotorRunTime } from "./motor-services.js";
import { publishDeviceSettings, updateLatestStarterSettings, updateLatestStarterSettingsFlc } from "./settings-services.js";
import { applyDeviceAllocation, getStarterByMacWithMotor } from "./starter-services.js";
import { gateways } from "../../database/schemas/gateways.js";
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
            await deviceSyncUpdate(payload, topic);
            break;
        case "DEVICE_SERIAL_NUMBER_ALLOCATION_ACK":
            await deviceSerialNumberAllocationAckHandler(payload, topic);
            break;
        case "TEMPERATURE_THRESHOLD_SETTING":
            await adminConfigDataRequestAckHandler(payload, topic);
            break;
        case "DEVICE_RESET_ACK":
            await deviceResetAckHandler(payload, topic);
            break;
        case "DEVICE_INFO_ACK":
            await deviceInfoAckHandler(payload, topic);
            break;
        case "SCHEDULING_ACK":
            scheduleCreationAckResolver(payload, topic);
            break;
        default:
            return null;
    }
}
const VALID_MODES = ["AUTO", "MANUAL"];
export async function updateStates(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp, avg_current, active_schedule_id, active_schedule_type, active_schedule_start_time, active_schedule_runtime_minutes, active_schedule_end_time, last_off_description, last_on_description } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
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
                    await ActivityService.writeMotorSyncLogs(created_by || device_created_by, motor_id, { state: prevState, mode: prevMode }, {
                        state: motor_state, mode: mode_description, last_on_description, last_off_description
                    }, trx, starter_id);
                }
                const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
                const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
                const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
                const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
                if (shouldTrackMotorRuntime || isFirstRecord) {
                    await trackMotorRunTime({
                        starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: updateData.state ?? prevState,
                        mode_description, time_stamp, previous_power_state: power, new_power_state: power_present
                    }, trx);
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
            const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, motor_state, mode_description, starter_id, starter_number) : null;
            const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, mode_description, starter_id, starter_number) : null;
            const pumpName = motor.alias_name === undefined || motor.alias_name === null ? starter_number : motor.alias_name;
            // Prepare alert and fault notifications only when they exist
            let notificationDataFault = null;
            let notificationDataFaultCleared = null;
            if (fault_description && created_by && motor_id && fault !== 0) {
                notificationDataFault = {
                    userId: created_by, title: `${pumpName} Fault Detected`,
                    message: getFaultNotificationMessage(fault), motorId: motor_id, starter_id: starter_id
                };
            }
            // Check if fault was cleared (fault === 0 and previous fault was non-zero)
            if (fault === 0 && created_by && motor_id) {
                const lastFaultRecord = await trx.select({ fault_code: alertsFaults.fault_code })
                    .from(alertsFaults)
                    .where(and(eq(alertsFaults.motor_id, motor_id), eq(alertsFaults.starter_id, starter_id), isNotNull(alertsFaults.fault_code), ne(alertsFaults.fault_code, 0)))
                    .orderBy(desc(alertsFaults.timestamp))
                    .limit(1);
                const prevFaultCode = lastFaultRecord[0]?.fault_code;
                if (prevFaultCode !== undefined && prevFaultCode !== 0) {
                    notificationDataFaultCleared = {
                        userId: created_by, title: `${pumpName} Faults Cleared`,
                        message: `${pumpName} has no more faults`,
                        motorId: motor_id, starter_id: starter_id
                    };
                    await ActivityService.writeFaultClearedLog(created_by, motor_id, starter_id, { fault_code: prevFaultCode }, trx);
                }
            }
            // Update actual schedule fields with device-reported values
            if (active_schedule_id && motor_id && starter_id) {
                await updateActualScheduleFields(motor_id, starter_id, active_schedule_id, {
                    actual_start_time: active_schedule_start_time,
                    actual_end_time: active_schedule_end_time,
                    actual_run_time: active_schedule_runtime_minutes,
                    actual_type: active_schedule_type,
                }, trx);
            }
            const notificationData = { notificationDataState, notificationDataMode, notificationDataFault, notificationDataFaultCleared };
            return notificationData;
        });
        // Send notification after transaction completes (debounced: skip if same notification was sent within 2 minutes)
        // state notification
        if (notificationData.notificationDataState) {
            const stateNotoificatioData = notificationData.notificationDataState;
            if (shouldSendNotification(stateNotoificatioData.motorId, "state", motor_state)) {
                await sendUserNotification(stateNotoificatioData.userId, stateNotoificatioData.title, stateNotoificatioData.message, stateNotoificatioData.motorId, stateNotoificatioData.starterId);
            }
        }
        // mode notification
        if (notificationData.notificationDataMode) {
            const modeNotificationData = notificationData.notificationDataMode;
            if (shouldSendNotification(modeNotificationData.motorId, "mode", mode_description)) {
                await sendUserNotification(modeNotificationData.userId, modeNotificationData.title, modeNotificationData.message, modeNotificationData.motorId, modeNotificationData.starterId);
            }
        }
        // fault notification
        if (notificationData.notificationDataFault) {
            const faultNotificationData = notificationData.notificationDataFault;
            if (shouldSendNotification(faultNotificationData.motorId, "fault", fault)) {
                await sendUserNotification(faultNotificationData.userId, faultNotificationData.title, faultNotificationData.message, faultNotificationData.motorId, faultNotificationData.starter_id);
            }
        }
        // fault cleared notification
        if (notificationData.notificationDataFaultCleared) {
            const faultClearedData = notificationData.notificationDataFaultCleared;
            if (shouldSendNotification(faultClearedData.motorId, "fault_cleared", 0)) {
                await sendUserNotification(faultClearedData.userId, faultClearedData.title, faultClearedData.message, faultClearedData.motorId, faultClearedData.starter_id);
            }
        }
    }
    catch (error) {
        console.error("Error updating states in live data ack Go1:", error);
        throw error;
    }
}
export async function updateDevicePowerAndMotorStateToON(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp, avg_current, active_schedule_id, active_schedule_start_time, active_schedule_end_time, active_schedule_runtime_minutes, active_schedule_type } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
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
                await ActivityService.writeMotorSyncLogs(created_by || device_created_by, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: mode_description }, trx, starter_id);
            }
        }
        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
        const hasStateChanged = typeof motor_state === "number" && motor_state !== prevState;
        const hasModeChanged = mode_description && mode_description !== prevMode;
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
        if (shouldTrackMotorRuntime || isFirstRecord) {
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
        // Update actual schedule fields with device-reported values
        if (active_schedule_id && motor_id && starter_id) {
            await updateActualScheduleFields(motor_id, starter_id, active_schedule_id, {
                actual_start_time: active_schedule_start_time,
                actual_end_time: active_schedule_end_time,
                actual_run_time: active_schedule_runtime_minutes,
                actual_type: active_schedule_type,
            }, trx);
        }
        const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, motor_state, mode_description, starter_id, starter_number) : null;
        const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, mode_description, starter_id, starter_number) : null;
        return { notificationDataState, notificationDataMode };
    });
    if (notificationData.notificationDataState) {
        if (shouldSendNotification(notificationData.notificationDataState.motorId, "state", motor_state)) {
            await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
        }
    }
    if (notificationData.notificationDataMode) {
        if (shouldSendNotification(notificationData.notificationDataMode.motorId, "mode", mode_description)) {
            await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
        }
    }
}
export async function updateDevicePowerONAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
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
            await ActivityService.writeMotorSyncLogs(created_by || device_created_by, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: prevMode }, trx, starter_id);
        }
        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
        const hasStateChanged = typeof motor_state === "number" && motor_state !== prevState;
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
        if (shouldTrackMotorRuntime || isFirstRecord) {
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
        const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, motor_state, mode_description, starter_id, starter_number) : null;
        return { notificationDataState };
    });
    if (notificationData.notificationDataState) {
        if (shouldSendNotification(notificationData.notificationDataState.motorId, "state", motor_state)) {
            await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
        }
    }
}
export async function updateDevicePowerAndMotorStateOFF(insertedData, previousData) {
    const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code, alert_description, fault, fault_description, time_stamp, temp } = insertedData;
    const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
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
            await ActivityService.writeMotorSyncLogs(created_by || device_created_by, motor_id, { mode: prevMode }, { mode: mode_description }, trx, starter_id);
        }
        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
        if (shouldTrackMotorRuntime || isFirstRecord) {
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
        const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, mode_description, starter_id, starter_number) : null;
        return { notificationDataMode };
    });
    if (notificationData.notificationDataMode) {
        if (shouldSendNotification(notificationData.notificationDataMode.motorId, "mode", mode_description)) {
            await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
        }
    }
}
// Motor control ack
export async function motorControlAckHandler(message, topic) {
    try {
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId) {
            logger.error("Invalid topic format: Device MAC not found", undefined, { topic });
            return;
        }
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id || !device.motors || device.motors.length === 0) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return;
            }
        }
        const starter_id = device.id;
        if (device.starter_type === "MULTI_STARTER") {
            // message.D = { m1: { m_s: 1 }, m2: { m_s: 0 } }
            const motorRefs = Object.keys(message.D ?? {});
            const notifications = [];
            for (const ref of motorRefs) {
                const motor = device.motors.find((m) => m.motor_reference === ref);
                if (!motor) {
                    logger.warn(`[MULTI_STARTER] MOTOR_CONTROL_ACK: no DB motor with motor_reference="${ref}" — skipping`);
                    continue;
                }
                const newState = message.D[ref]?.m_s;
                if (newState === undefined || newState === null)
                    continue;
                const prevState = motor.state;
                const mode_description = motor.mode;
                const motor_id = motor.id;
                const location_id = motor.location_id;
                const stateChanged = newState !== prevState;
                const notificationData = await db.transaction(async (trx) => {
                    if (stateChanged && (newState === 0 || newState === 1)) {
                        await trx.update(motors).set({ state: newState, updated_at: new Date() }).where(eq(motors.id, motor_id));
                        await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
                    }
                    else {
                        const isFirstRecord = motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
                        if (isFirstRecord) {
                            await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
                        }
                    }
                    await ActivityService.writeMotorAckLogs(motor.created_by || device.created_by, motor_id, { state: prevState, mode: mode_description }, { state: newState, mode: mode_description }, "MOTOR_CONTROL_ACK", trx, starter_id);
                    return stateChanged ? prepareMotorStateControlNotificationData(motor, newState, mode_description, starter_id, device.starter_number) : null;
                });
                if (notificationData)
                    notifications.push({ data: notificationData, newState });
            }
            for (const { data, newState } of notifications) {
                if (shouldSendNotification(data.motorId, "state", newState)) {
                    await sendUserNotification(data.userId, data.title, data.message, data.motorId, starter_id);
                }
            }
        }
        else {
            // SINGLE_STARTER — existing path unchanged
            const motor = device.motors[0];
            const motor_id = motor.id;
            const location_id = motor.location_id;
            const mode_description = motor.mode;
            const prevState = motor.state;
            const newState = message.D;
            const stateChanged = newState !== prevState;
            const notificationData = await db.transaction(async (trx) => {
                if (stateChanged && (newState === 0 || newState === 1)) {
                    await trx.update(motors).set({ state: newState, updated_at: new Date() }).where(eq(motors.id, motor.id));
                    await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
                }
                else {
                    const isFirstRecord = motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
                    if (isFirstRecord) {
                        await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
                    }
                }
                await ActivityService.writeMotorAckLogs(motor.created_by || device.created_by, motor.id, { state: prevState, mode: mode_description }, { state: newState, mode: mode_description }, "MOTOR_CONTROL_ACK", trx, starter_id);
                return stateChanged ? prepareMotorStateControlNotificationData(motor, newState, mode_description, starter_id, device.starter_number) : null;
            });
            if (notificationData) {
                if (shouldSendNotification(notificationData.motorId, "state", newState)) {
                    await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId, starter_id);
                }
            }
        }
    }
    catch (error) {
        logger.error("Error at motor control ack handler", error);
        throw error;
    }
}
// Motor mode ack
export async function motorModeChangeAckHandler(message, topic) {
    try {
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId) {
            logger.error("Invalid topic format: Device MAC not found", undefined, { topic });
            return null;
        }
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id || !device.motors.length) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        if (device.starter_type === "MULTI_STARTER") {
            // message.D = { m1: { mode: 1 }, m2: { mode: 0 } }
            const motorRefs = Object.keys(message.D ?? {});
            const notifications = [];
            for (const ref of motorRefs) {
                const motor = device.motors.find((m) => m.motor_reference === ref);
                if (!motor) {
                    logger.warn(`[MULTI_STARTER] MODE_CHANGE_ACK: no DB motor with motor_reference="${ref}" — skipping`);
                    continue;
                }
                const rawMode = message.D[ref]?.mode;
                if (rawMode === undefined || rawMode === null)
                    continue;
                const mode = controlMode(rawMode);
                const modeChanged = mode !== motor.mode;
                await db.transaction(async (trx) => {
                    if (modeChanged && (mode === "MANUAL" || mode === "AUTO")) {
                        await trx.update(motors).set({ mode: mode, updated_at: new Date() }).where(eq(motors.id, motor.id));
                    }
                    await ActivityService.writeMotorAckLogs(motor.created_by || device.created_by, motor.id, { mode: motor.mode }, { mode }, "MOTOR_MODE_ACK", trx, device.id);
                });
                if (modeChanged) {
                    notifications.push({ data: prepareMotorModeControlNotificationData(motor, mode, device.id, device.starter_number), mode });
                }
            }
            for (const { data, mode } of notifications) {
                if (shouldSendNotification(data.motorId, "mode", mode)) {
                    await sendUserNotification(data.userId, data.title, data.message, data.motorId, data.starterId);
                }
            }
        }
        else {
            // SINGLE_STARTER — existing path unchanged
            const mode = controlMode(message.D);
            const motor = device.motors[0];
            await db.transaction(async (trx) => {
                if (mode !== motor.mode) {
                    if (mode == "MANUAL" || mode == "AUTO") {
                        await trx.update(motors).set({ mode: mode, updated_at: new Date() }).where(eq(motors.id, motor.id));
                    }
                }
                await ActivityService.writeMotorAckLogs(motor.created_by || device.created_by, motor.id, { mode: motor.mode }, { mode }, "MOTOR_MODE_ACK", trx, device.id);
            });
            const modeChanged = mode !== motor.mode;
            const notificationData = modeChanged ? prepareMotorModeControlNotificationData(motor, mode, device.id, device.starter_number) : null;
            if (notificationData) {
                if (shouldSendNotification(notificationData.motorId, "mode", mode)) {
                    await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId, notificationData.starterId);
                }
            }
        }
    }
    catch (error) {
        logger.error("Error at motor mode change ack handler", error);
        throw error;
    }
}
export async function heartbeatHandler(message, topic) {
    try {
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId) {
            logger.error("Invalid topic format: Device MAC not found", undefined, { topic });
            return null;
        }
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        const { strength, status } = getValidStrength(message.D.s_q);
        const validNetwork = getValidNetwork(message.D.nwt);
        if (device.signal_quality !== strength || device.network_type !== message.D.nwt)
            await updateRecordById(starterBoxes, device.id, { signal_quality: strength, network_type: validNetwork, status: status });
        if (message.D.s_q >= 2 && message.D.s_q <= 30 && device.synced_settings_status === "false")
            await publishDeviceSettings(device);
    }
    catch (error) {
        logger.error("Error at heartbeat topic handler", error);
        throw error;
    }
}
export async function deviceSerialNumberAllocationAckHandler(message, topic) {
    try {
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId)
            return null;
        const upperId = deviceId.trim().toUpperCase();
        const byMac = await db.query.starterBoxes.findFirst({
            where: and(eq(starterBoxes.mac_address, upperId), ne(starterBoxes.status, "ARCHIVED")),
            columns: { id: true, user_id: true, created_by: true, device_allocation: true, gateway_id: true },
        });
        const matchType = byMac ? "mac" : "pcb";
        const starter = byMac ?? await db.query.starterBoxes.findFirst({
            where: and(eq(starterBoxes.pcb_number, upperId), ne(starterBoxes.status, "ARCHIVED")),
            columns: { id: true, user_id: true, created_by: true, device_allocation: true, gateway_id: true },
        });
        if (!starter?.id) {
            logger.error(`Device not found for identifier [${upperId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (starter.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        if (message.D !== 1)
            return null;
        const userId = starter.user_id || starter.created_by;
        if (!userId)
            return null;
        // PCB = deallocation, MAC = allocation
        const newAllocation = matchType === "pcb" ? "false" : "true";
        // Skip if already in target state
        if (starter.device_allocation === newAllocation)
            return null;
        await applyDeviceAllocation(starter.id, newAllocation, userId);
    }
    catch (error) {
        logger.error("Error at device serial number allocation ack handler", error);
        throw error;
    }
}
export function publishData(preparedData, starterData) {
    if (!starterData)
        return null;
    // const macOrPcb = starterData.device_status === 'READY' || starterData.device_status === 'TEST' ? starterData.mac_address : starterData.pcb_number;
    const macOrPcb = starterData.device_allocation === "false" ? starterData.mac_address : starterData.pcb_number;
    const topic = `peepul/${macOrPcb}/cmd`;
    const payload = JSON.stringify(preparedData);
    mqttServiceInstance.publish(topic, payload);
}
export async function deviceSyncUpdate(message, topic) {
    const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
    try {
        if (!deviceId) {
            logger.error("Invalid topic format: Device MAC not found", undefined, { topic });
            return null;
        }
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        if (message.D === undefined || message.D === null || (message.D !== 0 && message.D !== 1)) {
            logger.error(`Invalid message data in calibration ack [${message.D}]`, undefined, { deviceId });
            return null;
        }
        const pendingAck = pendingAckMap.get(deviceId);
        if (!pendingAck) {
            logger.warn(`No pending ACK found for ${deviceId}`);
            return null;
        }
        if (pendingAck.sequenceNumber !== undefined && pendingAck.sequenceNumber !== message.S) {
            logger.warn(`Schedule ACK sequence mismatch for ${deviceId}: expected ${pendingAck.sequenceNumber}, received ${message.S}`);
            return null;
        }
        if (message.D === 1) {
            pendingAck.resolve(true);
            pendingAckMap.delete(deviceId);
            logger.info(`Calibration ACK success for ${deviceId}`);
            const updatedDevice = await getStarterByMacWithMotor(deviceId);
            if (updatedDevice?.id) {
                await updateLatestStarterSettings(updatedDevice.id, message.D);
                if (updatedDevice.synced_settings_status === "false") {
                    await updateRecordById(starterBoxes, updatedDevice.id, { synced_settings_status: "true" });
                }
            }
        }
        else {
            pendingAck.resolve(false);
            pendingAckMap.delete(deviceId);
            logger.warn(`Calibration ACK failed (D=0) for ${deviceId}, skipping DB update`);
        }
    }
    catch (error) {
        const pendingAck = deviceId ? pendingAckMap.get(deviceId) : undefined;
        if (pendingAck) {
            pendingAck.resolve(false);
            pendingAckMap.delete(deviceId);
        }
        logger.error("Error at device sync update (calibration ack)", error);
        throw error;
    }
}
export async function adminConfigDataRequestAckHandler(message, topic) {
    try {
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId)
            return null;
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        if (message.D === undefined || message.D === null || (message.D !== 0 && message.D !== 1)) {
            logger.error(`Invalid message data in admin config ack [${message.D}]`, undefined, { deviceId });
            return null;
        }
        const pendingAck = pendingAckMap.get(deviceId);
        if (pendingAck) {
            pendingAck.resolve(true);
            pendingAckMap.delete(deviceId);
        }
        await updateLatestStarterSettings(device.id, message.D);
        if (device.synced_settings_status === "false") {
            await updateRecordById(starterBoxes, device.id, { synced_settings_status: "true" });
        }
    }
    catch (error) {
        logger.error("Error at admin config ack handler", error);
        throw error;
    }
}
export async function deviceResetAckHandler(message, topic) {
    try {
        const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
        if (!deviceId)
            return null;
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        if (message.D === undefined || message.D === null || (message.D !== 0 && message.D !== 1)) {
            logger.error(`Invalid message data in device reset ack [${message.D}]`, undefined, { deviceId });
            return null;
        }
        const updatedFields = { device_reset_status: message.D === 1 ? "true" : "false" };
        const changedStatus = device.device_reset_status !== updatedFields.device_reset_status;
        if (changedStatus)
            await updateRecordById(starterBoxes, device.id, updatedFields);
    }
    catch (error) {
        logger.error("Error at device reset ack handler", error);
        throw error;
    }
}
export async function deviceInfoAckHandler(message, topic) {
    const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
    if (!deviceId)
        return null;
    const updatedFields = {};
    try {
        const pendingAck = pendingAckMap.get(deviceId);
        if (pendingAck) {
            pendingAck.resolve(true);
            pendingAckMap.delete(deviceId);
        }
        const device = await getStarterByMacWithMotor(deviceId);
        if (!device?.id) {
            logger.error(`Device not found for identifier [${deviceId}]`, undefined, { deviceId, topic });
            return null;
        }
        if (gatewayId) {
            const gateway = await getGatewayByIdentifier(gatewayId);
            if (!gateway) {
                logger.error(`Gateway not found for identifier [${gatewayId}]`, undefined, { gatewayId, topic });
                return null;
            }
            if (device.gateway_id !== gateway.id) {
                logger.error(`Gateway and device mapping mismatch for topic [${topic}]`, undefined, { gatewayId, deviceId });
                return null;
            }
        }
        if (!message.D) {
            logger.error("Invalid message data in device info ack", undefined, { deviceId });
            return null;
        }
        if (message.D.version && message.D.version !== device.hardware_version) {
            updatedFields.hardware_version = message.D.version;
        }
        const hasValue = (value) => value !== undefined && value !== null &&
            typeof value === "string" && value.trim() !== "";
        if (hasValue(message.D.val) && message.D.val !== device.sim_recharge_expires_at) {
            updatedFields.sim_recharge_expires_at = message.D.val;
        }
        if (hasValue(message.D.sim_num)) {
            const rawSim = String(message.D.sim_num).replace(/^\+91/, '');
            const simNumber = rawSim.slice(0, 40);
            if (simNumber.length >= 1 && simNumber.length <= 40 && simNumber !== device.device_mobile_number) {
                updatedFields.device_mobile_number = simNumber;
            }
        }
        if (Object.keys(updatedFields).length > 0) {
            await updateRecordById(starterBoxes, device.id, updatedFields);
        }
    }
    catch (error) {
        const pendingAck = pendingAckMap.get(deviceId);
        if (pendingAck) {
            pendingAck.resolve(false);
            pendingAckMap.delete(deviceId);
        }
        if (error?.code === "23505" || error?.cause?.code === "23505") {
            const duplicateMobile = updatedFields.device_mobile_number;
            logger.info(`Device Info ACK failed for ${deviceId} - Duplicate mobile number: ${duplicateMobile}`);
            logger.mqtt(`Duplicate SIM number detected during device info ACK | MAC: ${deviceId} | Mobile: ${duplicateMobile}`);
            return;
        }
        logger.error(`Device Info ACK error for ${deviceId}: ${error.message}`);
        logger.mqtt(`MQTT Device Info ACK error | MAC: ${deviceId} | Error: ${error.message}`);
    }
}
function scheduleCreationAckResolver(message, topic) {
    const { deviceId } = getIdentifiersFromTopic(topic);
    if (!deviceId)
        return;
    const pendingAck = pendingAckMap.get(deviceId);
    if (!pendingAck) {
        logger.warn(`No pending schedule ACK found for ${deviceId}`);
        return;
    }
    if (pendingAck.sequenceNumber !== undefined && pendingAck.sequenceNumber !== message.S) {
        logger.warn(`Schedule ACK sequence mismatch for ${deviceId}: expected ${pendingAck.sequenceNumber}, received ${message.S}`);
        return;
    }
    const dValue = typeof message.D === "number" ? message.D : -1;
    // D=1: processed (success), D=4: waiting for next schedule (success), D=0: failure, D=2: flash issue
    const ackSuccess = dValue === 1 || dValue === 4;
    pendingAck.resolve(ackSuccess);
    pendingAckMap.delete(deviceId);
    logger.info(`Schedule creation ACK resolved for ${deviceId}, D=${dValue}, success=${ackSuccess}`);
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
