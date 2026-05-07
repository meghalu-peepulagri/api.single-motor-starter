import { and, desc, eq, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { alertsFaults } from "../../database/schemas/alerts-faults.js";
import { deviceTemperature, type DeviceTemperatureTable } from "../../database/schemas/device-temperature.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters, type StarterBoxParametersTable } from "../../database/schemas/starter-parameters.js";
import { pendingAckMap } from "../../helpers/ack-tracker-hepler.js";
import { controlMode, getFaultNotificationMessage } from "../../helpers/control-helpers.js";
import { prepareAlertClearedNotificationData, prepareAlertNotificationData, prepareFaultClearedNotificationData, prepareFaultNotificationData, prepareSignalCodeChange, shouldPersistSignalCodeChange } from "../../helpers/fault-notification-helper.js";
import { extractPreviousData, prepareMotorModeControlNotificationData, prepareMotorStateControlNotificationData, prepareMotorSyncChangeData } from "../../helpers/motor-helper.js";
import { getIdentifiersFromTopic, liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { prepareLiveDataPayload, prepareStarterParametersRecord } from "../../helpers/prepare-live-data-payload-helper.js";
import { shouldSendNotification } from "../../helpers/notification-debounce.js";
import { getValidNetwork, getValidStrength } from "../../helpers/packet-types-helper.js";
import type { preparedLiveData, previousPreparedLiveData } from "../../types/app-types.js";
import { logger } from "../../utils/logger.js";
import { sendUserNotification } from "../fcm/fcm-service.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { ActivityService } from "./activity-service.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { getGatewayByIdentifier } from "./gateway-services.js";
import { updateActualScheduleFields } from "./motor-schedules-services.js";
import { hasMotorRunTimeRecord, trackDeviceRunTime, trackMotorRunTime } from "./motor-services.js";
import { writeDeviceStatusHistoryIfChanged, writeMotorStatusHistoryIfChanged, writePowerStatusHistoryIfChanged } from "./status-history-services.js";
import { publishDeviceSettings, updateLatestStarterSettings, updateLatestStarterSettingsFlc } from "./settings-services.js";
import { applyDeviceAllocation, getStarterByMacWithMotor } from "./starter-services.js";
import { gateways } from "../../database/schemas/gateways.js";
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


const VALID_MODES = ["AUTO", "MANUAL"] as const;
type ValidMode = typeof VALID_MODES[number];

async function getLockedMotorSnapshot(trx: any, motorId: number) {
  const [motorRecord] = await trx
    .select({
      state: motors.state,
      mode: motors.mode,
      location_id: motors.location_id,
      created_by: motors.created_by,
    })
    .from(motors)
    .where(eq(motors.id, motorId))
    .for("update");

  return motorRecord ?? null;
}

async function getLatestAlertsFaultsSnapshot(trx: any, starterId: number, motorId: number) {
  const [record] = await trx
    .select({
      alert_code: alertsFaults.alert_code,
      fault_code: alertsFaults.fault_code,
    })
    .from(alertsFaults)
    .where(and(
      eq(alertsFaults.starter_id, starterId),
      eq(alertsFaults.motor_id, motorId),
    ))
    .orderBy(desc(alertsFaults.timestamp), desc(alertsFaults.id))
    .limit(1);

  return record ?? null;
}

export async function updateStates(insertedData: preparedLiveData, previousData: previousPreparedLiveData) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code,
    alert_description, fault, fault_description, time_stamp, temp, avg_current } = insertedData;
  const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
  if (!starter_id) return null;

  const isInTestRun = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["starter_id", "id", "test_run_status"], ["=", "=", "="], [starter_id, motor_id, "PROCESSING"], ["test_run_status"]);
  if (isInTestRun && isInTestRun.test_run_status === "PROCESSING") await updateLatestStarterSettingsFlc(starter_id, avg_current)

  const record = prepareStarterParametersRecord(insertedData);
  try {
    const notificationData = await db.transaction(async (trx) => {
      await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, record, trx);
      if (motor_id) await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);

      const starterBoxUpdates: Record<string, any> = {};
      let trackPowerChange = false;

      if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
        starterBoxUpdates.power = power_present;
        if (power_present === 1) starterBoxUpdates.last_power_on_at = new Date(time_stamp);
        else if (power_present === 0) starterBoxUpdates.last_power_off_at = new Date(time_stamp);
        trackPowerChange = true;
      }

      if (temp !== null && temp !== undefined) {
        starterBoxUpdates.temperature = temp;
      }

      await writePowerStatusHistoryIfChanged({
        starter_id,
        motor_id: motor_id ?? null,
        status: power_present === 1 ? "ON" : "OFF",
        time_stamp: new Date(time_stamp),
        trx,
      });

      if (Object.keys(starterBoxUpdates).length > 0) {
        await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);
        await trackDeviceRunTime({
          starter_id, motor_id, location_id: locationId, previous_power_state: power,
          new_power_state: power_present, motor_state, mode_description, time_stamp
        }, trx);

      }

      let effectivePrevState = prevState;
      let effectivePrevMode = prevMode;
      let effectiveCreatedBy = created_by || device_created_by;
      let effectiveLocationId = locationId;
      let notificationMotor = motor;

      if (motor_id) {
        const currentMotorRecord = await getLockedMotorSnapshot(trx, motor_id);
        effectivePrevState = currentMotorRecord?.state ?? prevState;
        effectivePrevMode = currentMotorRecord?.mode ?? prevMode;
        effectiveCreatedBy = currentMotorRecord?.created_by ?? created_by ?? device_created_by;
        effectiveLocationId = currentMotorRecord?.location_id ?? locationId;
        notificationMotor = {
          ...motor,
          created_by: effectiveCreatedBy ?? motor.created_by,
          location_id: effectiveLocationId ?? motor.location_id,
          mode: effectivePrevMode ?? motor.mode,
          state: effectivePrevState ?? motor.state,
        };

        const motorSyncChange = prepareMotorSyncChangeData({
          currentState: effectivePrevState,
          currentMode: effectivePrevMode,
          incomingState: motor_state,
          incomingMode: mode_description,
          timeStamp: time_stamp,
        });
        const shouldWriteMotorHistory = motorSyncChange.nextState === 0 || motorSyncChange.nextState === 1;

        if (shouldWriteMotorHistory) {
          await writeMotorStatusHistoryIfChanged({
            starter_id,
            motor_id,
            status: motorSyncChange.nextState === 1 ? "ON" : "OFF",
            time_stamp: new Date(time_stamp),
            trx,
          });
        }

        if (motorSyncChange.shouldUpdateMotor) {
          await updateRecordByIdWithTrx(motors, motor_id, motorSyncChange.updateData, trx);
          await ActivityService.writeMotorSyncLogs(effectiveCreatedBy, motor_id,
            { state: effectivePrevState, mode: effectivePrevMode }, {
            state: motorSyncChange.nextState,
            mode: motorSyncChange.nextMode
          }, trx, starter_id);
        }


        const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
        const hasMotorStateChanged = motorSyncChange.hasStateChanged;
        const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
        const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;

        if (shouldTrackMotorRuntime || isFirstRecord) {
          await trackMotorRunTime({
            starter_id, motor_id, location_id: effectiveLocationId, previous_state: effectivePrevState ?? 0, new_state: motorSyncChange.nextState ?? effectivePrevState ?? 0,
            mode_description, time_stamp, previous_power_state: power, new_power_state: power_present
          }, trx);
        }
      }

      const currentAlertCode = alert_code != null ? Number(alert_code) : null;
      const currentFaultCode = fault != null ? Number(fault) : null;

      const notificationUserId = created_by ?? device_created_by;

      // get previous snapshot
      const latestAlertsFaultsSnapshot = motor_id
        ? await getLatestAlertsFaultsSnapshot(trx, starter_id, motor_id)
        : null;

      const previousAlertCode = latestAlertsFaultsSnapshot?.alert_code ?? null;
      const previousFaultCode = latestAlertsFaultsSnapshot?.fault_code ?? null;

      const alertCodeChange = prepareSignalCodeChange(previousAlertCode, currentAlertCode);
      const faultCodeChange = prepareSignalCodeChange(previousFaultCode, currentFaultCode);

      const hasCurrAlert = currentAlertCode !== null && currentAlertCode !== 0;
      const hasCurrFault = currentFaultCode !== null && currentFaultCode !== 0;

      // Use the latest stored device-level alert/fault snapshot to suppress
      // duplicate "no alert" / "no fault" rows from continuous live data packets.
      const isAlertRaised = alertCodeChange.isDetected;
      const isAlertCleared = alertCodeChange.isCleared;
      const isAlertChanged = alertCodeChange.hasChanged && !alertCodeChange.isDetected && !alertCodeChange.isCleared;

      const isFaultRaised = faultCodeChange.isDetected;
      const isFaultCleared = faultCodeChange.isCleared;
      const isFaultChanged = faultCodeChange.hasChanged && !faultCodeChange.isDetected && !faultCodeChange.isCleared;

      // ✅ FINAL STORE CONDITION
      const shouldStore =
        shouldPersistSignalCodeChange(alertCodeChange) ||
        shouldPersistSignalCodeChange(faultCodeChange);

      // ✅ DESCRIPTION HANDLING
      const finalAlertDescription =
        isAlertCleared
          ? "No more alerts"
          : hasCurrAlert
            ? (alert_description ?? null)
            : null;

      const finalFaultDescription =
        isFaultCleared
          ? "No more faults"
          : hasCurrFault
            ? (fault_description ?? null)
            : null;

      const shouldWriteAlertFields = shouldPersistSignalCodeChange(alertCodeChange);
      const shouldWriteFaultFields = shouldPersistSignalCodeChange(faultCodeChange);

      // record
      const alertsFaultsRecord = {
        starter_id,
        motor_id: motor_id ?? null,
        user_id: notificationUserId,
        alert_code: shouldWriteAlertFields ? currentAlertCode : null,
        fault_code: shouldWriteFaultFields ? currentFaultCode : null,
        alert_description: shouldWriteAlertFields ? finalAlertDescription : null,
        fault_description: shouldWriteFaultFields ? finalFaultDescription : null,
        timestamp: new Date(time_stamp)
      };

      // ✅ SAVE ONLY WHEN REAL CHANGE
      if (shouldStore) {
        await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
      }

      // state & mode (unchanged)
      const hasStateChanged =
        typeof motor_state === "number" &&
        (motor_state === 0 || motor_state === 1) &&
        motor_state !== effectivePrevState;

      const hasModeChanged =
        VALID_MODES.includes(mode_description as ValidMode) &&
        mode_description !== effectivePrevMode;

      const notificationDataState = hasStateChanged
        ? prepareMotorStateControlNotificationData(
          notificationMotor,
          motor_state,
          mode_description,
          starter_id,
          starter_number
        )
        : null;

      const notificationDataMode = hasModeChanged
        ? prepareMotorModeControlNotificationData(
          notificationMotor,
          mode_description,
          starter_id,
          starter_number
        )
        : null;

      const pumpName = notificationMotor.alias_name ?? starter_number;

      // -------------------
      // ALERT NOTIFICATIONS
      // -------------------

      let notificationDataAlert = null;
      let notificationDataAlertCleared = null;

      if (isAlertRaised) {
        notificationDataAlert = prepareAlertNotificationData({
          alertCode: currentAlertCode,
          alertDescription: alert_description,
          userId: notificationUserId,
          motorId: motor_id,
          starterId: starter_id,
          pumpName,
        });
      }

      if (isAlertCleared) {
        notificationDataAlertCleared = prepareAlertClearedNotificationData({
          currentAlertCode,
          previousAlertCode,
          userId: notificationUserId,
          motorId: motor_id,
          starterId: starter_id,
          pumpName,
        });
      }

      // -------------------
      // FAULT NOTIFICATIONS
      // -------------------

      let notificationDataFault = null;
      let notificationDataFaultCleared = null;

      if (isFaultRaised) {
        notificationDataFault = prepareFaultNotificationData({
          faultCode: currentFaultCode,
          faultDescription: fault_description,
          userId: notificationUserId,
          motorId: motor_id,
          starterId: starter_id,
          pumpName,
        });
      }

      if (isFaultCleared) {
        notificationDataFaultCleared = prepareFaultClearedNotificationData({
          currentFaultCode,
          previousFaultCode,
          userId: notificationUserId,
          motorId: motor_id,
          starterId: starter_id,
          pumpName,
        });
      }

      // Update actual schedule fields with device-reported values
      if (insertedData.active_schedule_id && motor_id && starter_id) {
        await updateActualScheduleFields(motor_id, starter_id, insertedData.active_schedule_id, {
          actual_start_time: insertedData.active_schedule_start_time,
          actual_end_time: insertedData.active_schedule_end_time,
          actual_run_time: insertedData.active_schedule_runtime_minutes,
          actual_type: insertedData.active_schedule_type,
          missed_minutes: insertedData.active_schedule_missed_minutes,
          failure_at: insertedData.active_schedule_failure_at,
          failure_reason: insertedData.active_schedule_failure_reason,
        }, trx);
      }

      return {
        notificationDataState,
        notificationDataMode,
        notificationDataAlert,
        notificationDataAlertCleared,
        notificationDataFault,
        notificationDataFaultCleared
      };
    });

    if (notificationData.notificationDataState) {
      if (shouldSendNotification(notificationData.notificationDataState.motorId, "state", motor_state ?? 0)) {
        await sendUserNotification(
          notificationData.notificationDataState.userId,
          notificationData.notificationDataState.title,
          notificationData.notificationDataState.message,
          notificationData.notificationDataState.motorId,
          notificationData.notificationDataState.starterId
        );
      }
    }

    if (notificationData.notificationDataMode) {
      if (shouldSendNotification(notificationData.notificationDataMode.motorId, "mode", mode_description)) {
        await sendUserNotification(
          notificationData.notificationDataMode.userId,
          notificationData.notificationDataMode.title,
          notificationData.notificationDataMode.message,
          notificationData.notificationDataMode.motorId,
          notificationData.notificationDataMode.starterId
        );
      }
    }

    if (notificationData.notificationDataAlert) {
      if (shouldSendNotification(notificationData.notificationDataAlert.motorId, "alert", alert_code ?? 0)) {
        await sendUserNotification(
          notificationData.notificationDataAlert.userId,
          notificationData.notificationDataAlert.title,
          notificationData.notificationDataAlert.message,
          notificationData.notificationDataAlert.motorId,
          notificationData.notificationDataAlert.starter_id
        );
      }
    }

    if (notificationData.notificationDataAlertCleared) {
      if (shouldSendNotification(notificationData.notificationDataAlertCleared.motorId, "alert_cleared", 0)) {
        await sendUserNotification(
          notificationData.notificationDataAlertCleared.userId,
          notificationData.notificationDataAlertCleared.title,
          notificationData.notificationDataAlertCleared.message,
          notificationData.notificationDataAlertCleared.motorId,
          notificationData.notificationDataAlertCleared.starter_id
        );
      }
    }

    if (notificationData.notificationDataFault) {
      if (shouldSendNotification(notificationData.notificationDataFault.motorId, "fault", fault ?? 0)) {
        await sendUserNotification(
          notificationData.notificationDataFault.userId,
          notificationData.notificationDataFault.title,
          notificationData.notificationDataFault.message,
          notificationData.notificationDataFault.motorId,
          notificationData.notificationDataFault.starter_id
        );
      }
    }

    if (notificationData.notificationDataFaultCleared) {
      if (shouldSendNotification(notificationData.notificationDataFaultCleared.motorId, "fault_cleared", 0)) {
        await sendUserNotification(
          notificationData.notificationDataFaultCleared.userId,
          notificationData.notificationDataFaultCleared.title,
          notificationData.notificationDataFaultCleared.message,
          notificationData.notificationDataFaultCleared.motorId,
          notificationData.notificationDataFaultCleared.starter_id
        );
      }
    }
  } catch (error: any) {
    console.error("Error updating states in live data ack Go1:", error);
    throw error;
  }
}

export async function updateDevicePowerAndMotorStateToON(insertedData: preparedLiveData, previousData: previousPreparedLiveData) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code,
    alert_description, fault, fault_description, time_stamp, temp, avg_current } = insertedData;
  const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
  if (!starter_id || !motor_id) return null;

  const isInTestRun = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["starter_id", "id", "test_run_status"], ["=", "=", "="], [starter_id, motor_id, "PROCESSING"], ["test_run_status"]);
  if (isInTestRun && isInTestRun.test_run_status === "PROCESSING") await updateLatestStarterSettingsFlc(starter_id, avg_current);

  const record = prepareStarterParametersRecord(insertedData);
  const notificationData = await db.transaction(async (trx) => {
    await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, record, trx);
    await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);

    const starterBoxUpdates: Record<string, any> = {};
    let trackPowerChange = false;

    if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
      starterBoxUpdates.power = power_present;
      if (power_present === 1) starterBoxUpdates.last_power_on_at = new Date(time_stamp);
      else if (power_present === 0) starterBoxUpdates.last_power_off_at = new Date(time_stamp);
      trackPowerChange = true;
    }

    if (temp !== null && temp !== undefined) {
      starterBoxUpdates.temperature = temp;
    }

    await writePowerStatusHistoryIfChanged({
      starter_id,
      motor_id,
      status: power_present === 1 ? "ON" : "OFF",
      time_stamp: new Date(time_stamp),
      trx,
    });

    if (Object.keys(starterBoxUpdates).length > 0) {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);

      if (trackPowerChange) {
        await trackDeviceRunTime({
          starter_id, motor_id, location_id: locationId, previous_power_state: power,
          new_power_state: power_present, motor_state, mode_description, time_stamp
        }, trx);
      }
    }

    let effectivePrevState = prevState;
    let effectivePrevMode = prevMode;
    let effectiveCreatedBy = created_by || device_created_by;
    let effectiveLocationId = locationId;
    let notificationMotor = motor;

    if (motor_id) {
      const currentMotorRecord = await getLockedMotorSnapshot(trx, motor_id);
      effectivePrevState = currentMotorRecord?.state ?? prevState;
      effectivePrevMode = currentMotorRecord?.mode ?? prevMode;
      effectiveCreatedBy = currentMotorRecord?.created_by ?? created_by ?? device_created_by;
      effectiveLocationId = currentMotorRecord?.location_id ?? locationId;
      notificationMotor = {
        ...motor,
        created_by: effectiveCreatedBy ?? motor.created_by,
        location_id: effectiveLocationId ?? motor.location_id,
        mode: effectivePrevMode ?? motor.mode,
        state: effectivePrevState ?? motor.state,
      };

      const motorSyncChange = prepareMotorSyncChangeData({
        currentState: effectivePrevState,
        currentMode: effectivePrevMode,
        incomingState: motor_state,
        incomingMode: mode_description,
        timeStamp: time_stamp,
      });
      const shouldWriteMotorHistory = motorSyncChange.nextState === 0 || motorSyncChange.nextState === 1;

      if (motorSyncChange.shouldUpdateMotor) {
        await updateRecordByIdWithTrx(motors, motor_id, motorSyncChange.updateData, trx);
        await ActivityService.writeMotorSyncLogs(effectiveCreatedBy, motor_id,
          { state: effectivePrevState, mode: effectivePrevMode },
          { state: motorSyncChange.nextState, mode: motorSyncChange.nextMode },
          trx,
          starter_id
        );
      }

      await writeMotorStatusHistoryIfChanged({
        starter_id,
        motor_id,
        status: motorSyncChange.nextState === 1 ? "ON" : "OFF",
        time_stamp: new Date(time_stamp),
        trx,
      });
    }

    const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
    const hasMotorStateChanged = typeof motor_state === "number" && (motor_state === 0 || motor_state === 1) && motor_state !== effectivePrevState;
    const hasStateChanged = typeof motor_state === "number" && (motor_state === 0 || motor_state === 1) && motor_state !== effectivePrevState;
    const hasModeChanged = VALID_MODES.includes(mode_description as ValidMode) && mode_description !== effectivePrevMode;

    const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
    const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
    if (shouldTrackMotorRuntime || isFirstRecord) {
      await trackMotorRunTime({ starter_id, motor_id, location_id: effectiveLocationId, previous_state: effectivePrevState ?? 0, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
    }

    const currentAlertCode = alert_code != null ? Number(alert_code) : null;
    const currentFaultCode = fault != null ? Number(fault) : null;
    const latestAlertsFaultsSnapshot = await getLatestAlertsFaultsSnapshot(trx, starter_id, motor_id);
    const alertCodeChange = prepareSignalCodeChange(latestAlertsFaultsSnapshot?.alert_code ?? null, currentAlertCode);
    const faultCodeChange = prepareSignalCodeChange(latestAlertsFaultsSnapshot?.fault_code ?? null, currentFaultCode);
    const shouldPersistAlertChange = shouldPersistSignalCodeChange(alertCodeChange);
    const shouldPersistFaultChange = shouldPersistSignalCodeChange(faultCodeChange);
    const alertsFaultsRecord = {
      starter_id, motor_id: motor_id || null, user_id: created_by || null,
      alert_code: shouldPersistAlertChange ? currentAlertCode : null,
      alert_description: shouldPersistAlertChange ? (alert_description ? String(alert_description) : null) : null,
      fault_code: shouldPersistFaultChange ? currentFaultCode : null,
      fault_description: shouldPersistFaultChange ? (fault_description ? String(fault_description) : null) : null,
      timestamp: new Date(time_stamp)
    };

    if ((currentAlertCode !== null || currentFaultCode !== null) && (shouldPersistAlertChange || shouldPersistFaultChange)) {
      await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
    }

    // Update actual schedule fields with device-reported values
    if (insertedData.active_schedule_id && motor_id && starter_id) {
      await updateActualScheduleFields(motor_id, starter_id, insertedData.active_schedule_id, {
        actual_start_time: insertedData.active_schedule_start_time,
        actual_end_time: insertedData.active_schedule_end_time,
        actual_run_time: insertedData.active_schedule_runtime_minutes,
        actual_type: insertedData.active_schedule_type,
        missed_minutes: insertedData.active_schedule_missed_minutes,
        failure_at: insertedData.active_schedule_failure_at,
        failure_reason: insertedData.active_schedule_failure_reason,
      }, trx);
    }

    const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(notificationMotor, motor_state, mode_description, starter_id, starter_number) : null;
    const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(notificationMotor, mode_description, starter_id, starter_number) : null;

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


export async function updateDevicePowerONAndMotorStateOFF(insertedData: preparedLiveData, previousData: previousPreparedLiveData) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code,
    alert_description, fault, fault_description, time_stamp, temp } = insertedData;
  const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
  if (!starter_id || !motor_id) return null;

  const record = prepareStarterParametersRecord(insertedData);
  const notificationData = await db.transaction(async (trx) => {
    await saveSingleRecord(starterBoxParameters, record, trx);
    await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);

    const starterBoxUpdates: Record<string, any> = {};
    let trackPowerChange = false;

    if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
      starterBoxUpdates.power = power_present;
      if (power_present === 1) starterBoxUpdates.last_power_on_at = new Date(time_stamp);
      else if (power_present === 0) starterBoxUpdates.last_power_off_at = new Date(time_stamp);
      trackPowerChange = true;
    }

    if (temp !== null && temp !== undefined) {
      starterBoxUpdates.temperature = temp;
    }

    await writePowerStatusHistoryIfChanged({
      starter_id,
      motor_id,
      status: power_present === 1 ? "ON" : "OFF",
      time_stamp: new Date(time_stamp),
      trx,
    });

    if (Object.keys(starterBoxUpdates).length > 0) {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);

      if (trackPowerChange) {
        await trackDeviceRunTime({
          starter_id, motor_id, location_id: locationId, previous_power_state: power,
          new_power_state: power_present, motor_state, mode_description, time_stamp
        }, trx);
      }
    }

    const currentMotorRecord = await getLockedMotorSnapshot(trx, motor_id);
    const effectivePrevState = currentMotorRecord?.state ?? prevState;
    const effectivePrevMode = currentMotorRecord?.mode ?? prevMode;
    const effectiveCreatedBy = currentMotorRecord?.created_by ?? created_by ?? device_created_by;
    const effectiveLocationId = currentMotorRecord?.location_id ?? locationId;
    const notificationMotor = {
      ...motor,
      created_by: effectiveCreatedBy ?? motor.created_by,
      location_id: effectiveLocationId ?? motor.location_id,
      mode: effectivePrevMode ?? motor.mode,
      state: effectivePrevState ?? motor.state,
    };
    const motorSyncChange = prepareMotorSyncChangeData({
      currentState: effectivePrevState,
      currentMode: effectivePrevMode,
      incomingState: motor_state,
      incomingMode: mode_description,
      timeStamp: time_stamp,
    });
    const shouldWriteMotorHistory = motorSyncChange.nextState === 0 || motorSyncChange.nextState === 1;

    if (motorSyncChange.hasStateChanged) {
      await updateRecordByIdWithTrx(motors, motor_id, motorSyncChange.updateData, trx);
      await ActivityService.writeMotorSyncLogs(effectiveCreatedBy, motor_id, { state: effectivePrevState, mode: effectivePrevMode }, { state: motorSyncChange.nextState, mode: effectivePrevMode }, trx, starter_id);
    }
    await writeMotorStatusHistoryIfChanged({
      starter_id,
      motor_id,
      status: motorSyncChange.nextState === 1 ? "ON" : "OFF",
      time_stamp: new Date(time_stamp),
      trx,
    });
    const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
    const hasMotorStateChanged = motorSyncChange.hasStateChanged;
    const hasStateChanged = motorSyncChange.hasStateChanged;
    const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
    const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
    if (shouldTrackMotorRuntime || isFirstRecord) {
      await trackMotorRunTime({ starter_id, motor_id, location_id: effectiveLocationId, previous_state: effectivePrevState ?? 0, new_state: motorSyncChange.nextState ?? effectivePrevState ?? 0, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
    }

    const currentAlertCode = alert_code != null ? Number(alert_code) : null;
    const currentFaultCode = fault != null ? Number(fault) : null;
    const latestAlertsFaultsSnapshot = await getLatestAlertsFaultsSnapshot(trx, starter_id, motor_id);
    const alertCodeChange = prepareSignalCodeChange(latestAlertsFaultsSnapshot?.alert_code ?? null, currentAlertCode);
    const faultCodeChange = prepareSignalCodeChange(latestAlertsFaultsSnapshot?.fault_code ?? null, currentFaultCode);
    const shouldPersistAlertChange = shouldPersistSignalCodeChange(alertCodeChange);
    const shouldPersistFaultChange = shouldPersistSignalCodeChange(faultCodeChange);
    const alertsFaultsRecord = {
      starter_id, motor_id: motor_id || null, user_id: created_by || device_created_by,
      alert_code: shouldPersistAlertChange ? currentAlertCode : null,
      alert_description: shouldPersistAlertChange ? (alert_description ? String(alert_description) : null) : null,
      fault_code: shouldPersistFaultChange ? currentFaultCode : null,
      fault_description: shouldPersistFaultChange ? (fault_description ? String(fault_description) : null) : null,
      timestamp: new Date(time_stamp)
    };

    if ((currentAlertCode !== null || currentFaultCode !== null) && (shouldPersistAlertChange || shouldPersistFaultChange)) {
      await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
    }

    const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(notificationMotor, motor_state, mode_description, starter_id, starter_number) : null;

    // Update actual schedule fields with device-reported values
    if (insertedData.active_schedule_id && motor_id && starter_id) {
      await updateActualScheduleFields(motor_id, starter_id, insertedData.active_schedule_id, {
        actual_start_time: insertedData.active_schedule_start_time,
        actual_end_time: insertedData.active_schedule_end_time,
        actual_run_time: insertedData.active_schedule_runtime_minutes,
        actual_type: insertedData.active_schedule_type,
        missed_minutes: insertedData.active_schedule_missed_minutes,
        failure_at: insertedData.active_schedule_failure_at,
        failure_reason: insertedData.active_schedule_failure_reason,
      }, trx);
    }

    return { notificationDataState };
  });

  if (notificationData.notificationDataState) {
    if (shouldSendNotification(notificationData.notificationDataState.motorId, "state", motor_state)) {
      await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
    }
  }
}


export async function updateDevicePowerAndMotorStateOFF(insertedData: preparedLiveData, previousData: previousPreparedLiveData) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code,
    alert_description, fault, fault_description, time_stamp, temp } = insertedData;
  const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
  if (!starter_id || !motor_id) return null;

  const record = prepareStarterParametersRecord(insertedData);
  const notificationData = await db.transaction(async (trx) => {
    await saveSingleRecord(starterBoxParameters, record, trx);
    await saveSingleRecord<DeviceTemperatureTable>(deviceTemperature, { device_id: starter_id, motor_id, temperature: temp, time_stamp }, trx);
    const starterBoxUpdates: Record<string, any> = {};
    let trackPowerChange = false;

    if (power_present !== power && power_present !== null && (power_present === 1 || power_present === 0)) {
      starterBoxUpdates.power = power_present;
      if (power_present === 1) starterBoxUpdates.last_power_on_at = new Date(time_stamp);
      else if (power_present === 0) starterBoxUpdates.last_power_off_at = new Date(time_stamp);
      trackPowerChange = true;
    }

    if (temp !== null && temp !== undefined) {
      starterBoxUpdates.temperature = temp;
    }

    await writePowerStatusHistoryIfChanged({
      starter_id,
      motor_id,
      status: power_present === 1 ? "ON" : "OFF",
      time_stamp: new Date(time_stamp),
      trx,
    });

    if (Object.keys(starterBoxUpdates).length > 0) {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, starterBoxUpdates, trx);
      if (trackPowerChange) {
        await trackDeviceRunTime({
          starter_id, motor_id, location_id: locationId, previous_power_state: power,
          new_power_state: power_present, motor_state, mode_description, time_stamp
        }, trx);
      }
    }

    const currentMotorRecord = await getLockedMotorSnapshot(trx, motor_id);
    const effectivePrevState = currentMotorRecord?.state ?? prevState;
    const effectivePrevMode = currentMotorRecord?.mode ?? prevMode;
    const effectiveCreatedBy = currentMotorRecord?.created_by ?? created_by ?? device_created_by;
    const effectiveLocationId = currentMotorRecord?.location_id ?? locationId;
    const notificationMotor = {
      ...motor,
      created_by: effectiveCreatedBy ?? motor.created_by,
      location_id: effectiveLocationId ?? motor.location_id,
      mode: effectivePrevMode ?? motor.mode,
      state: effectivePrevState ?? motor.state,
    };
    const motorSyncChange = prepareMotorSyncChangeData({
      currentState: effectivePrevState,
      currentMode: effectivePrevMode,
      incomingState: motor_state,
      incomingMode: mode_description,
      timeStamp: time_stamp,
    });

    await writeMotorStatusHistoryIfChanged({
      starter_id,
      motor_id,
      status: motorSyncChange.nextState === 1 ? "ON" : "OFF",
      time_stamp: new Date(time_stamp),
      trx,
    });

    if (motorSyncChange.hasModeChanged) {
      await updateRecordByIdWithTrx(motors, motor_id, motorSyncChange.updateData, trx);
      await ActivityService.writeMotorSyncLogs(effectiveCreatedBy, motor_id, { mode: effectivePrevMode }, { mode: motorSyncChange.nextMode }, trx, starter_id);
    }
    const hasPowerChanged = power_present !== power && power_present !== null && (power_present === 1 || power_present === 0);
    const hasMotorStateChanged = typeof motor_state === "number" && motor_state !== effectivePrevState && (motor_state === 0 || motor_state === 1);
    const shouldTrackMotorRuntime = hasMotorStateChanged || hasPowerChanged;
    const isFirstRecord = !shouldTrackMotorRuntime && motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
    if (shouldTrackMotorRuntime || isFirstRecord) {
      await trackMotorRunTime({ starter_id, motor_id, location_id: effectiveLocationId, previous_state: effectivePrevState ?? 0, new_state: motor_state, mode_description, time_stamp, previous_power_state: power, new_power_state: power_present }, trx);
    }

    const currentAlertCode = alert_code != null ? Number(alert_code) : null;
    const currentFaultCode = fault != null ? Number(fault) : null;
    const latestAlertsFaultsSnapshot = await getLatestAlertsFaultsSnapshot(trx, starter_id, motor_id);
    const alertCodeChange = prepareSignalCodeChange(latestAlertsFaultsSnapshot?.alert_code ?? null, currentAlertCode);
    const faultCodeChange = prepareSignalCodeChange(latestAlertsFaultsSnapshot?.fault_code ?? null, currentFaultCode);
    const shouldPersistAlertChange = shouldPersistSignalCodeChange(alertCodeChange);
    const shouldPersistFaultChange = shouldPersistSignalCodeChange(faultCodeChange);
    const alertsFaultsRecord = {
      starter_id, motor_id: motor_id || null, user_id: created_by || null,
      alert_code: shouldPersistAlertChange ? currentAlertCode : null,
      alert_description: shouldPersistAlertChange ? (alert_description ? String(alert_description) : null) : null,
      fault_code: shouldPersistFaultChange ? currentFaultCode : null,
      fault_description: shouldPersistFaultChange ? (fault_description ? String(fault_description) : null) : null,
      timestamp: new Date(time_stamp)
    };

    if ((currentAlertCode !== null || currentFaultCode !== null) && (shouldPersistAlertChange || shouldPersistFaultChange)) {
      await saveSingleRecord(alertsFaults, alertsFaultsRecord, trx);
    }

    const hasModeChanged = motorSyncChange.hasModeChanged;
    const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(notificationMotor, mode_description, starter_id, starter_number) : null;

    // Update actual schedule fields with device-reported values
    if (insertedData.active_schedule_id && motor_id && starter_id) {
      await updateActualScheduleFields(motor_id, starter_id, insertedData.active_schedule_id, {
        actual_start_time: insertedData.active_schedule_start_time,
        actual_end_time: insertedData.active_schedule_end_time,
        actual_run_time: insertedData.active_schedule_runtime_minutes,
        actual_type: insertedData.active_schedule_type,
        missed_minutes: insertedData.active_schedule_missed_minutes,
        failure_at: insertedData.active_schedule_failure_at,
        failure_reason: insertedData.active_schedule_failure_reason,
      }, trx);
    }

    return { notificationDataMode };
  });

  if (notificationData.notificationDataMode) {
    if (shouldSendNotification(notificationData.notificationDataMode.motorId, "mode", mode_description)) {
      await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
    }
  }
}


// Motor control ack
export async function motorControlAckHandler(message: any, topic: string) {
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
      const notifications: Array<{ data: any; newState: number }> = [];

      for (const ref of motorRefs) {
        const motor: any = device.motors.find((m: any) => m.motor_reference === ref);
        if (!motor) {
          logger.warn(`[MULTI_STARTER] MOTOR_CONTROL_ACK: no DB motor with motor_reference="${ref}" — skipping`);
          continue;
        }

        const newState = message.D[ref]?.m_s;
        if (newState === undefined || newState === null) continue;

        const prevState = motor.state;
        const mode_description = motor.mode;
        const motor_id = motor.id;
        const location_id = motor.location_id;
        const stateChanged = newState !== prevState;

        const notificationData = await db.transaction(async (trx) => {
          if (stateChanged && (newState === 0 || newState === 1)) {
            await trx.update(motors).set({ state: newState, updated_at: new Date() }).where(eq(motors.id, motor_id));
            await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
          } else {
            const isFirstRecord = motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
            if (isFirstRecord) {
              await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
            }
          }
          await ActivityService.writeMotorAckLogs(motor.created_by || device.created_by, motor_id, { state: prevState, mode: mode_description }, { state: newState, mode: mode_description }, "MOTOR_CONTROL_ACK", trx, starter_id);
          return stateChanged ? prepareMotorStateControlNotificationData(motor, newState, mode_description, starter_id, device.starter_number) : null;
        });

        if (notificationData) notifications.push({ data: notificationData, newState });
      }

      for (const { data, newState } of notifications) {
        if (shouldSendNotification(data.motorId, "state", newState)) {
          await sendUserNotification(data.userId, data.title, data.message, data.motorId, starter_id);
        }
      }
    } else {
      // SINGLE_STARTER
      const motor: any = device.motors[0];
      const motor_id = motor.id;
      const location_id = motor.location_id;
      const mode_description = motor.mode;
      const prevState = motor.state;
      const newState = message.D;
      const stateChanged = newState !== prevState;
      const shouldWriteMotorHistory = newState === 0 || newState === 1;

      const notificationData = await db.transaction(async (trx) => {
        if (stateChanged && (newState === 0 || newState === 1)) {
          const updateData: any = { state: newState, updated_at: new Date() };
          if (newState === 1) updateData.motor_last_on_at = new Date();
          else if (newState === 0) updateData.motor_last_off_at = new Date();
          await trx.update(motors).set(updateData).where(eq(motors.id, motor.id));
          await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
        } else {
          const isFirstRecord = motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
          if (isFirstRecord) {
            await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
          }
        }
        if (shouldWriteMotorHistory) {
          await writeMotorStatusHistoryIfChanged({ starter_id, motor_id, status: newState === 1 ? "ON" : "OFF", time_stamp: new Date(), trx });
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
  } catch (error: any) {
    logger.error("Error at motor control ack handler", error);
    throw error;
  }
}

// Motor mode ack
export async function motorModeChangeAckHandler(message: any, topic: string) {
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
      const notifications: Array<{ data: any; mode: string }> = [];

      for (const ref of motorRefs) {
        const motor: any = device.motors.find((m: any) => m.motor_reference === ref);
        if (!motor) {
          logger.warn(`[MULTI_STARTER] MODE_CHANGE_ACK: no DB motor with motor_reference="${ref}" — skipping`);
          continue;
        }

        const rawMode = message.D[ref]?.mode;
        if (rawMode === undefined || rawMode === null) continue;

        const mode = controlMode(rawMode);
        const modeChanged = mode !== motor.mode;

        await db.transaction(async (trx) => {
          if (modeChanged && (mode === "MANUAL" || mode === "AUTO")) {
            await trx.update(motors).set({ mode: mode as any, last_mode_change_at: new Date(), updated_at: new Date() }).where(eq(motors.id, motor.id));
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
    } else {
      // SINGLE_STARTER — existing path unchanged
      const mode = controlMode(message.D);
      const motor = device.motors[0];

      await db.transaction(async (trx) => {
        if (mode !== motor.mode) {
          if (mode == "MANUAL" || mode == "AUTO") {
            await trx.update(motors).set({ mode: mode as any, last_mode_change_at: new Date(), updated_at: new Date() }).where(eq(motors.id, motor.id));
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
  } catch (error: any) {
    logger.error("Error at motor mode change ack handler", error);
    throw error;
  }
}


export async function heartbeatHandler(message: any, topic: string) {
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

    const heartbeatAt = new Date();
    const { strength, status } = getValidStrength(message.D.s_q);
    const validNetwork = getValidNetwork(message.D.nwt);
    const statusChanged = device.status !== status;
    const signalChanged = device.signal_quality !== strength;
    const networkChanged = device.network_type !== validNetwork;

    const starterBoxUpdates: any = { last_signal_received_at: heartbeatAt };
    if (signalChanged || networkChanged || statusChanged) {
      starterBoxUpdates.signal_quality = strength;
      starterBoxUpdates.network_type = validNetwork;
      starterBoxUpdates.status = status;
    }

    if (statusChanged) {
      await writeDeviceStatusHistoryIfChanged({
        starter_id: device.id,
        status,
        time_stamp: heartbeatAt,
      });
    }

    await db.transaction(async (trx) => {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, device.id, starterBoxUpdates, trx);

      if (message.D.s_q >= 2 && message.D.s_q <= 30 && device.synced_settings_status === "false") await publishDeviceSettings(device);
    });
  } catch (error: any) {
    logger.error("Error at heartbeat topic handler", error);
    throw error;
  }
}

export async function deviceSerialNumberAllocationAckHandler(message: any, topic: string) {
  try {
    const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
    if (!deviceId) return null;
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

    if (message.D !== 1) return null;

    const userId = starter.user_id || starter.created_by;
    if (!userId) return null;

    // PCB = deallocation, MAC = allocation
    const newAllocation: "true" | "false" = matchType === "pcb" ? "false" : "true";

    // Skip if already in target state
    if (starter.device_allocation === newAllocation) return null;

    await applyDeviceAllocation(starter.id, newAllocation, userId);
  } catch (error: any) {
    logger.error("Error at device serial number allocation ack handler", error);
    throw error;
  }
}

export function publishData(preparedData: any, starterData: StarterBox) {
  if (!starterData) return null;
  // const macOrPcb = starterData.device_status === 'READY' || starterData.device_status === 'TEST' ? starterData.mac_address : starterData.pcb_number;
  const macOrPcb = starterData.device_allocation === "false" ? starterData.mac_address : starterData.pcb_number;
  const topic = `peepul/${macOrPcb}/cmd`;
  const payload = JSON.stringify(preparedData);
  mqttServiceInstance.publish(topic, payload);
}

export async function deviceSyncUpdate(message: any, topic: string) {
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
          await updateRecordById<StarterBoxTable>(starterBoxes, updatedDevice.id, { synced_settings_status: "true" });
        }
      }
    } else {
      pendingAck.resolve(false);
      pendingAckMap.delete(deviceId);
      logger.warn(`Calibration ACK failed (D=0) for ${deviceId}, skipping DB update`);
    }

  } catch (error: any) {
    const pendingAck = deviceId ? pendingAckMap.get(deviceId) : undefined;
    if (pendingAck) {
      pendingAck.resolve(false);
      pendingAckMap.delete(deviceId!);
    }
    logger.error("Error at device sync update (calibration ack)", error);
    throw error;
  }
}

export async function adminConfigDataRequestAckHandler(
  message: any,
  topic: string
) {
  try {
    const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
    if (!deviceId) return null;

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
      await updateRecordById<StarterBoxTable>(starterBoxes, device.id, { synced_settings_status: "true" });
    }

  } catch (error: any) {
    logger.error("Error at admin config ack handler", error);
    throw error;
  }
}


export async function deviceResetAckHandler(message: any, topic: string) {
  try {
    const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
    if (!deviceId) return null;

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
    if (changedStatus) await updateRecordById<StarterBoxTable>(starterBoxes, device.id, updatedFields);
  } catch (error: any) {
    logger.error("Error at device reset ack handler", error);
    throw error;
  }
}

export async function deviceInfoAckHandler(message: any, topic: string) {
  const { gatewayId, deviceId } = getIdentifiersFromTopic(topic);
  if (!deviceId) return null;
  const updatedFields: Record<string, any> = {};
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

    const hasValue = (value: any) => value !== undefined && value !== null &&
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
      await updateRecordById<StarterBoxTable>(starterBoxes, device.id, updatedFields);
    }
  } catch (error: any) {
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

function scheduleCreationAckResolver(message: any, topic: string) {
  const { deviceId } = getIdentifiersFromTopic(topic);
  if (!deviceId) return;

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

/**
 * Inserts a starter_parameters record for an unmatched motor_reference block
 * (motor was unassigned from the device but the hardware keeps sending data).
 *
 * Resolves motor_id via two fallbacks (history lookup → motor_index lookup).
 * If no motor_id can be resolved, inserts with motor_id = null (column is now nullable).
 * Does NOT update motor state, mode, or any related tables.
 */
export async function insertParametersForUnmatchedMotor(
  device: any,
  motorRef: string,
  validated: any,
) {
  const starterId: number = device.id;

  // 1st: look for the last motor_id recorded for this starter + motor_reference
  const lastRecord = await db
    .select({ motor_id: starterBoxParameters.motor_id })
    .from(starterBoxParameters)
    .where(and(
      eq(starterBoxParameters.starter_id, starterId),
      eq(starterBoxParameters.motor_reference, motorRef),
    ))
    .orderBy(desc(starterBoxParameters.time_stamp))
    .limit(1);

  let motorId: number | null = lastRecord[0]?.motor_id ?? null;

  // 2nd fallback: motor is still assigned but has no motor_reference set —
  // match by motor_index (m1 → index 1, m2 → index 2)
  if (!motorId) {
    const motorIndex = motorRef === "m1" ? 1 : 2;
    const motorRecord = await db
      .select({ id: motors.id })
      .from(motors)
      .where(and(
        eq(motors.starter_id, starterId),
        eq(motors.motor_index, motorIndex),
        ne(motors.status, "ARCHIVED"),
      ))
      .limit(1);
    motorId = motorRecord[0]?.id ?? null;
  }

  // motor_id is now nullable — proceed with null when no motor exists at all
  const stubMotor = { id: motorId, motor_reference: motorRef, state: 0, mode: "AUTO" };
  const prepared = prepareLiveDataPayload(validated, device, stubMotor);
  if (!prepared) return;

  const record = prepareStarterParametersRecord(prepared);
  try {
    await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, record);
    logger.info(`[MULTI_STARTER] Parameters-only insert: starter_id=${starterId} motor_reference="${motorRef}" motor_id=${motorId}`);
  } catch (err: any) {
    logger.error(`[MULTI_STARTER] Parameters-only insert failed for motor_reference="${motorRef}"`, err);
  }
}
