import { eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { alertsFaults } from "../../database/schemas/alerts-faults.js";
import { deviceTemperature, type DeviceTemperatureTable } from "../../database/schemas/device-temperature.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters, type StarterBoxParametersTable } from "../../database/schemas/starter-parameters.js";
import { controlMode, getFaultDescription, getAlertDescription } from "../../helpers/control-helpers.js";
import { extractPreviousData, prepareMotorModeControlNotificationData, prepareMotorStateControlNotificationData } from "../../helpers/motor-helper.js";
import { liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { getValidNetwork, getValidStrength } from "../../helpers/packet-types-helper.js";
import type { preparedLiveData, previousPreparedLiveData } from "../../types/app-types.js";
import { logger } from "../../utils/logger.js";
import { sendUserNotification } from "../fcm/fcm-service.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { ActivityService } from "./activity-service.js";
import { getRecordsCount, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { trackDeviceRunTime, trackMotorRunTime } from "./motor-services.js";
import { updateLatestStarterSettings, updateLatestStarterSettingsFlc } from "./settings-services.js";
import { getStarterByMacWithMotor } from "./starter-services.js";

// Live data
export async function saveLiveDataTopic(insertedData: preparedLiveData, groupId: string, previousData: previousPreparedLiveData) {
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

export async function selectTopicAck(topicType: string, payload: any, topic: string) {

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
    default:
      return null;
  }

}


const VALID_MODES = ["AUTO", "MANUAL"] as const;
type ValidMode = typeof VALID_MODES[number];

export async function updateStates(insertedData: preparedLiveData, previousData: previousPreparedLiveData) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code,
    alert_description, fault, fault_description, time_stamp, temp, avg_current } = insertedData;

  const { power, prevState, prevMode, locationId, created_by, motor } = extractPreviousData(previousData, motor_id);
  if (!starter_id) return null;

  const parametersCount = await getRecordsCount(starterBoxParameters, [eq(starterBoxParameters.starter_id, starter_id)])
  if (parametersCount === 0) updateLatestStarterSettingsFlc(starter_id, avg_current)

  try {
    const notificationData = await db.transaction(async (trx) => {
      await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, { ...insertedData, payload_version: String(insertedData.payload_version), group_id: String(insertedData.group_id), temperature: temp }, trx);
      await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);

      const starterBoxUpdates: Record<string, any> = {};
      let trackPowerChange = false;

      if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
        starterBoxUpdates.power = power_present;
        trackPowerChange = true;
      }

      if (temp !== null && temp !== undefined) {
        starterBoxUpdates.temperature = temp;
      }

      if (Object.keys(starterBoxUpdates).length > 0) {
        await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);

        if (trackPowerChange) {
          await trackDeviceRunTime({
            starter_id, motor_id, location_id: locationId, previous_power_state: power,
            new_power_state: power_present, motor_state, mode_description, time_stamp
          }, trx);
        }
      }

      if (motor_id) {
        const updateData: any = {};
        let shouldUpdateMotor = false;

        if (typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1)) {
          updateData.state = motor_state;
          shouldUpdateMotor = true;
        }

        if (VALID_MODES.includes(mode_description as ValidMode) && mode_description !== prevMode) {
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
        await ActivityService.writeMotorSyncLogs(created_by || 0, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: mode_description }, trx, starter_id);
      }

      const alertsFaultsRecord = {
        starter_id, motor_id: motor_id || null, user_id: created_by || null, alert_code: alert_code ? Number(alert_code) : null,
        alert_description: alert_description ? String(alert_description) : null, fault_code: fault ? Number(fault) : null,
        fault_description: fault_description ? String(fault_description) : null, timestamp: new Date(time_stamp)
      };

      if (alert_code || fault) {
        await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
      }

      const notificationDataState = prepareMotorStateControlNotificationData(motor, motor_state, mode_description);
      const notificationDataMode = prepareMotorModeControlNotificationData(motor, mode_description);

      // Prepare alert and fault notifications
      let notificationDataAlert = null;
      let notificationDataFault = null;

      if (created_by && alert_description && motor_id) {
        notificationDataAlert = {
          userId: created_by, title: "Alert Detected",
          message: alert_description, motorId: motor_id
        };
      }

      if (fault_description && created_by && motor_id) {
        notificationDataFault = {
          userId: created_by, title: "Fault Detected",
          message: fault_description, motorId: motor_id
        };
      }

      const notificationData = { notificationDataState, notificationDataMode, notificationDataAlert, notificationDataFault };
      return notificationData;
    });

    // Send notification after transaction completes
    // state notification
    if (notificationData.notificationDataState) {
      const stateNotoificatioData = notificationData.notificationDataState;
      await sendUserNotification(stateNotoificatioData.userId, stateNotoificatioData.title, stateNotoificatioData.message, stateNotoificatioData.motorId);
    }
    // mode notification
    if (notificationData.notificationDataMode) {
      const modeNotificationData = notificationData.notificationDataMode;
      await sendUserNotification(modeNotificationData.userId, modeNotificationData.title, modeNotificationData.message, modeNotificationData.motorId);
    }
    // alert notification
    if (notificationData.notificationDataAlert) {
      const alertNotificationData = notificationData.notificationDataAlert;
      await sendUserNotification(alertNotificationData.userId, alertNotificationData.title, alertNotificationData.message, alertNotificationData.motorId);
    }
    // fault notification
    if (notificationData.notificationDataFault) {
      const faultNotificationData = notificationData.notificationDataFault;
      await sendUserNotification(faultNotificationData.userId, faultNotificationData.title, faultNotificationData.message, faultNotificationData.motorId);
    }

  } catch (error: any) {
    console.error("Error updating states in live data ack Go1:", error);
    throw error;
  }
}

export async function updateDevicePowerAndMotorStateToON(insertedData: preparedLiveData, previousData: any) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, time_stamp, temp, avg_current } = insertedData;
  const { power, prevState, prevMode, locationId, motor } = extractPreviousData(previousData, motor_id);
  if (!starter_id || !motor_id) return null;

  const parametersCount = await getRecordsCount(starterBoxParameters, [eq(starterBoxParameters.starter_id, starter_id)])
  if (parametersCount === 0) updateLatestStarterSettingsFlc(starter_id, avg_current)

  const notificationData = await db.transaction(async (trx) => {
    await saveSingleRecord(starterBoxParameters, { ...insertedData, payload_version: String(insertedData.payload_version), group_id: String(insertedData.group_id), temperature: temp }, trx);
    await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);

    const starterBoxUpdates: Record<string, any> = {};
    let trackPowerChange = false;

    if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
      starterBoxUpdates.power = power_present;
      trackPowerChange = true;
    }

    if (temp !== null && temp !== undefined) {
      starterBoxUpdates.temperature = temp;
    }

    if (Object.keys(starterBoxUpdates).length > 0) {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);

      if (trackPowerChange) {
        await trackDeviceRunTime({
          starter_id, motor_id, location_id: locationId, previous_power_state: power,
          new_power_state: power_present, motor_state, mode_description, time_stamp
        }, trx);
      }
    }

    if (motor_id) {
      const updateData: any = {};
      let shouldUpdateMotor = false;

      if (typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1)) {
        updateData.state = motor_state;
        shouldUpdateMotor = true;
      }

      if (VALID_MODES.includes(mode_description as ValidMode) && mode_description !== prevMode) {
        updateData.mode = mode_description;
        shouldUpdateMotor = true;
      }

      if (shouldUpdateMotor) {
        await updateRecordByIdWithTrx(motors, motor_id, updateData, trx);
      }

      await ActivityService.writeMotorSyncLogs(0, motor_id,
        { state: prevState, mode: prevMode },
        { state: motor_state, mode: mode_description },
        trx
      );
    }

    const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
    const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
    const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
    if (shouldTrackMotorRuntime) {
      await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
    }

    const notificationDataState = prepareMotorStateControlNotificationData(motor, motor_state, mode_description);
    const notificationDataMode = prepareMotorModeControlNotificationData(motor, mode_description);
    const notificationData = { notificationDataState, notificationDataMode };
    return notificationData;
  });

  if (notificationData.notificationDataState) {
    const stateNotoificatioData = notificationData.notificationDataState;
    await sendUserNotification(stateNotoificatioData.userId, stateNotoificatioData.title, stateNotoificatioData.message, stateNotoificatioData.motorId);
  }
  if (notificationData.notificationDataMode) {
    const modeNotificationData = notificationData.notificationDataMode;
    await sendUserNotification(modeNotificationData.userId, modeNotificationData.title, modeNotificationData.message, modeNotificationData.motorId);
  }
}


export async function updateDevicePowerONAndMotorStateOFF(insertedData: preparedLiveData, previousData: any) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, time_stamp, temp } = insertedData;
  const { power, prevState, prevMode, locationId, motor } = extractPreviousData(previousData, motor_id);
  if (!starter_id || !motor_id) return null;

  const notificationData = await db.transaction(async (trx) => {
    await saveSingleRecord(starterBoxParameters, { ...insertedData, payload_version: String(insertedData.payload_version), group_id: String(insertedData.group_id), temperature: temp }, trx);
    await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);

    const starterBoxUpdates: Record<string, any> = {};
    let trackPowerChange = false;

    if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
      starterBoxUpdates.power = power_present;
      trackPowerChange = true;
    }

    if (temp !== null && temp !== undefined) {
      starterBoxUpdates.temperature = temp;
    }

    if (Object.keys(starterBoxUpdates).length > 0) {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);

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
    await ActivityService.writeMotorSyncLogs(0, motor_id, { state: prevState, mode: prevMode }, { state: motor_state, mode: prevMode }, trx);
    const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
    const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
    const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
    if (shouldTrackMotorRuntime) {
      await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
    }
    const notificationData = prepareMotorStateControlNotificationData(motor, motor_state, mode_description);
    return notificationData;
  });

  if (notificationData) {
    await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId);
  }
}


export async function updateDevicePowerAndMotorStateOFF(insertedData: any, previousData: any) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, time_stamp, temp } = insertedData;
  const { power, prevState, prevMode, locationId, motor } = extractPreviousData(previousData, motor_id);
  if (!starter_id || !motor_id) return null;

  const notificationData = await db.transaction(async (trx) => {
    await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);
    const starterBoxUpdates: Record<string, any> = {};
    let trackPowerChange = false;

    if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
      starterBoxUpdates.power = power_present;
      trackPowerChange = true;
    }

    if (temp !== null && temp !== undefined) {
      starterBoxUpdates.temperature = temp;
    }

    if (Object.keys(starterBoxUpdates).length > 0) {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);
      if (trackPowerChange) {
        await trackDeviceRunTime({
          starter_id, motor_id, location_id: locationId, previous_power_state: power,
          new_power_state: power_present, motor_state, mode_description, time_stamp
        }, trx);
      }
    }


    if (VALID_MODES.includes(mode_description as ValidMode) && mode_description !== prevMode && motor_id) {
      await updateRecordByIdWithTrx(motors, motor_id, { mode: mode_description }, trx);
    }

    await ActivityService.writeMotorSyncLogs(0, motor_id, { mode: prevMode }, { mode: mode_description }, trx);
    const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
    const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== prevState && (motor_state === 0 || motor_state === 1);
    const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
    if (shouldTrackMotorRuntime) {
      await trackMotorRunTime({ starter_id, motor_id, location_id: locationId, previous_state: prevState, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
    }
    return prepareMotorModeControlNotificationData(motor, mode_description);
  });

  if (notificationData) {
    await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId);
  }
}


// Motor control ack
export async function motorControlAckHandler(message: any, topic: string) {
  try {
    const macAddress = topic.split("/")[1];
    if (!macAddress) {
      console.error("Invalid topic format: MAC address not found");
      return;
    }

    const validMac: any = await getStarterByMacWithMotor(macAddress);
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
      await ActivityService.writeMotorAckLogs(motor.created_by || 0, motor.id, { state: prevState, mode: mode_description }, { state: newState, mode: mode_description }, "MOTOR_CONTROL_ACK", trx, starter_id);

      return prepareMotorStateControlNotificationData(motor, newState, mode_description);

    });

    // Send notification after transaction completes
    if (notificationData) {
      await sendUserNotification(notificationData.userId, notificationData.title, notificationData.message, notificationData.motorId);
    }
  } catch (error: any) {
    logger.error("Error at motor control ack handler", error);
    console.error("Error at motor control ack handler", error);
    throw error;
  }
}

// Motor mode ack
export async function motorModeChangeAckHandler(message: any, topic: string) {
  try {
    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    if (!validMac?.id || !validMac.motors.length) {
      logger.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };

    const mode = controlMode(message.D);
    const motor = validMac.motors[0];

    await db.transaction(async (trx) => {
      if (mode !== motor.mode) {
        if (mode == "MANUAL" || mode == "AUTO") {
          await trx.update(motors).set({ mode: mode as any, updated_at: new Date() }).where(eq(motors.id, motor.id));
        }
      }
      await ActivityService.writeMotorAckLogs(motor.created_by || 0, motor.id,
        { mode: motor.mode },
        { mode: mode },
        "MOTOR_MODE_ACK",
        trx,
        validMac.id
      );
    });

    const messageContent = (mode === "AUTO" || mode === "MANUAL") ? `Pump mode updated from ${motor.mode} to ${mode} successfully` : `Pump mode not updated due to ${mode}`;

    if (motor.created_by) {
      await sendUserNotification(motor.created_by, "Pump Mode Update", messageContent, motor.id);
    }
  } catch (error: any) {
    logger.error("Error at motor mode change ack handler", error);
    console.error("Error at motor mode change ack handler", error);
    throw error;
  }
}


export async function heartbeatHandler(message: any, topic: string) {
  try {
    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    if (!validMac?.id) {
      console.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };
    const { strength, status } = getValidStrength(message.D.s_q);
    const validNetwork = getValidNetwork(message.D.nwt);
    if (validMac.signal_quality !== strength || validMac.network_type !== message.D.nwt) await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, { signal_quality: strength, network_type: validNetwork, status: status });

  } catch (error: any) {
    console.error("Error at heartbeat topic handler:", error);
    throw error;
  }
}

export async function deviceSerialNumberAllocationAckHandler(message: any, topic: string) {
  try {
    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    if (!validMac?.id) {
      console.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };

    if (message.D === 1) await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, { device_status: "DEPLOYED" });
  } catch (error: any) {
    console.error("Error at device serial number allocation ack handler:", error);
    throw error;
  }
}

export function publishData(preparedData: any, starterData: StarterBox) {
  if (!starterData) return null;
  const macOrPcb = starterData.device_status === 'READY' || starterData.device_status === 'TEST' ? starterData.mac_address : starterData.pcb_number;
  const topic = `peepul/${macOrPcb}/cmd`;
  const payload = JSON.stringify(preparedData);
  mqttServiceInstance.publish(topic, payload);
}

export async function adminConfigDataRequestAckHandler(message: any, topic: string) {
  try {
    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    if (!validMac?.id) {
      console.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };

    if (message.D === undefined || message.D === null || !validMac.id || (message.D !== 0 && message.D !== 1)) {
      console.error(`Invalid message data in admin config ack [${message.D}]`);
      return null;
    }

    await updateLatestStarterSettings(validMac.id, message.D);
  } catch (error: any) {
    console.error("Error at heartbeat topic handler:", error);
    throw error;
  }
}

export const waitForAck = (
  identifiers: Array<string | null>,
  timeoutMs: number,
  validator?: (message: any) => boolean
): Promise<boolean> => {
  return new Promise((resolve) => {
    const mqttClient = mqttServiceInstance.getClient();

    if (!mqttClient || !mqttClient.connected) {
      console.error("MQTT client not connected");
      resolve(false);
      return;
    }

    const validIdentifiers = identifiers.filter(Boolean) as string[];
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

    const onMessage = (receivedTopic: string, message: Buffer | string) => {
      if (!topics.includes(receivedTopic)) return;

      try {
        const payload = JSON.parse(message.toString());

        if (validator && !validator(payload)) return;

        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          cleanup();
          resolve(true);
        }
      } catch {
        // ignore invalid JSON
      }
    };

    topics.forEach((topic) => mqttClient.subscribe(topic));
    mqttClient.on("message", onMessage);
  });
};