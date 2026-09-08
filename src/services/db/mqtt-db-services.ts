import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { alertsFaults } from "../../database/schemas/alerts-faults.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";
import { deviceTemperature, type DeviceTemperatureTable } from "../../database/schemas/device-temperature.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters, type StarterBoxParametersTable } from "../../database/schemas/starter-parameters.js";
import { modeControlPendingAckMap, motorControlPendingAckMap, pendingAckMap, schedulePartialAckMap, settingsControlPendingAckMap, MAX_SETTINGS_SYNC_ATTEMPTS, clearSettingsSyncAttempts, getSettingsSyncAttempts, incrementSettingsSyncAttempts } from "../../helpers/ack-tracker-hepler.js";
import { prepareAlertClearedNotificationData, prepareAlertNotificationData, prepareFaultClearedNotificationData, prepareFaultNotificationData, prepareSignalCodeChange, shouldPersistSignalCodeChange } from "../../helpers/fault-notification-helper.js";
import { extractPreviousData, prepareMotorModeControlNotificationData, prepareMotorStateControlNotificationData, prepareMotorSyncChangeData } from "../../helpers/motor-helper.js";
import { normalizeDeviceAckD, parseMotorKey } from "../../helpers/motor-control-payload-helper.js";
import { liveDataHandler } from "../../helpers/mqtt-helpers.js";
import { prepareLiveDataPayload, prepareStarterParametersRecord } from "../../helpers/prepare-live-data-payload-helper.js";
import { shouldSendNotification } from "../../helpers/notification-debounce.js";
import { getModeControlStatusDescription, getMotorControlStatusDescription, getValidNetwork, getValidStrength, isMotorControlStateCode, modeControlCodeToMode } from "../../helpers/packet-types-helper.js";
import type { preparedLiveData, previousPreparedLiveData } from "../../types/app-types.js";
import type { OrderByQueryData } from "../../types/db-types.js";
import { logger } from "../../utils/logger.js";
import { sendUserNotification } from "../fcm/fcm-service.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { ActivityService } from "./activity-service.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { updateActualScheduleFields } from "./motor-schedules-services.js";
import { upsertScheduleLiveData } from "./motor-schedule-live-data-services.js";
import { insertScheduleLog } from "./motor-schedule-logs-services.js";
import { uploadLiveDataPacket } from "../s3/s3-service.js";
import { hasMotorRunTimeRecord, trackDeviceRunTime, trackMotorRunTime } from "./motor-services.js";
import { writeDeviceStatusHistoryIfChanged, writeMotorStatusHistoryIfChanged, writePowerStatusHistoryIfChanged } from "./status-history-services.js";
import { publishDeviceSettings, updateLatestStarterSettings, updateLatestStarterSettingsFlc, updateMultiMotorSettingsAck } from "./settings-services.js";
import { applyDeviceAllocation, getStarterByMacWithMotor } from "./starter-services.js";
import { pushPendingSchedulesForStarter } from "../../helpers/schedule-sync-helper.js";
// Postgres deadlock code. Concurrent MQTT messages for the same device can
// race on (starter_boxes, motors) row locks; the loser is killed with 40P01.
// The transaction was never committed, so a simple retry is safe.
const PG_DEADLOCK_CODE = "40P01";
const PG_SERIALIZATION_CODE = "40001";

async function withDeadlockRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const code = err?.cause?.code ?? err?.code;
      const isRetryable = code === PG_DEADLOCK_CODE || code === PG_SERIALIZATION_CODE;
      attempt++;
      if (!isRetryable || attempt >= maxAttempts) throw err;
      // Exponential backoff with jitter: 50ms → 100ms → 200ms → 400ms, +0-100ms jitter.
      const backoffMs = 50 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
      logger?.warn?.(`[${label}] ${code} on attempt ${attempt} — retrying in ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

// Per-device serialization. Concurrent MQTT messages for the SAME starter_id
// would otherwise race on the same (starter_boxes, motors) rows and deadlock
// repeatedly even with retries. By chaining work per key, only one tx for a
// given device runs at a time. Different devices remain fully parallel.
const deviceLocks = new Map<number, Promise<unknown>>();

function runSerializedPerDevice<T>(starterId: number | null | undefined, fn: () => Promise<T>): Promise<T> {
  // Without a starter_id we can't shard; fall through unserialised.
  if (!starterId) return fn();
  const prev = deviceLocks.get(starterId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  deviceLocks.set(starterId, next);
  // Clean up the map entry once this tail is the current one and it's done,
  // so the Map doesn't grow forever for short-lived devices.
  next.finally(() => {
    if (deviceLocks.get(starterId) === next) deviceLocks.delete(starterId);
  });
  return next;
}

// Live data
export async function saveLiveDataTopic(insertedData: preparedLiveData, groupId: string, previousData: previousPreparedLiveData) {
  const starterId = insertedData?.starter_id;
  switch (groupId) {
    case "G01": //  Live data topic
      await runSerializedPerDevice(starterId, () =>
        withDeadlockRetry("updateStates", () => updateStates(insertedData, previousData))
      );
      break;
    case "G02":
      // Update Device power & motor state to ON
      await runSerializedPerDevice(starterId, () =>
        withDeadlockRetry("updateDevicePowerAndMotorStateToON", () => updateDevicePowerAndMotorStateToON(insertedData, previousData))
      );
      break;
    case "G03":
      // Update Device power On & motor state to Off
      await runSerializedPerDevice(starterId, () =>
        withDeadlockRetry("updateDevicePowerONAndMotorStateOFF", () => updateDevicePowerONAndMotorStateOFF(insertedData, previousData))
      );
      break;
    case "G04":
      await runSerializedPerDevice(starterId, () =>
        withDeadlockRetry("updateDevicePowerAndMotorStateOFF", () => updateDevicePowerAndMotorStateOFF(insertedData, previousData))
      );
      break;
    default:
      return null;
  }
}

/**
 * Inserts a starter_parameters record for an unmatched multi-motor block — the
 * device is reporting live data for a motor slot (m1/m2) that has no motor
 * currently attached at that motor_index. Bypasses the full updateStates/
 * updateDevicePower... pipeline entirely (those short-circuit without motor_id
 * for G02-G04, and would wrongly touch motors/alerts/runtime tables for G01) —
 * this just records the raw reading with motor_id left null.
 */
export async function insertParametersForUnmatchedMotor(device: any, motorIndex: number, validated: any) {
  const stubMotor = { id: null, state: 0, mode: "AUTO" };
  const prepared = prepareLiveDataPayload(validated, device, stubMotor);
  if (!prepared) return;

  const record = prepareStarterParametersRecord(prepared);
  try {
    await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, record);
    logger.info(`[multi-motor] parameters-only insert starter_id=${device.id} motor_index=${motorIndex} (no motor attached at this slot)`);
  } catch (err: any) {
    logger.error(`[multi-motor] parameters-only insert failed starter_id=${device.id} motor_index=${motorIndex}`, err);
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
      await scheduleCreationAckResolver(payload, topic);
      break;
    case "FAULT_CLEAR_ACK":
      await faultClearAckHandler(payload, topic);
      break;
    default:
      return null;
  }

}


const VALID_MODES = ["AUTO", "MANUAL", "SCHEDULE", "BYPASS"] as const;
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

async function handleScheduleLiveData(insertedData: preparedLiveData, motorId: number, starterId: number) {
  const scheduleId = insertedData.active_schedule_id;
  if (!scheduleId) return;

  const packet = {
    schedule_id: scheduleId,
    motor_id: motorId,
    starter_id: starterId,
    device_start_time: insertedData.active_schedule_start_time ?? null,
    device_end_time: insertedData.active_schedule_end_time ?? null,
    device_run_time: insertedData.active_schedule_runtime_minutes ?? null,
    device_missed_minutes: insertedData.active_schedule_missed_minutes ?? 0,
    failure_reason: insertedData.active_schedule_failure_reason ?? null,
    failure_code: insertedData.active_failure_code || 0,
    received_at: new Date().toISOString(),
  };

  await Promise.all([
    upsertScheduleLiveData(packet).catch(() => null),
    insertScheduleLog({
      schedule_id: scheduleId,
      event_type: "LIVE_DATA_RECEIVED",
      actor_type: "device",
      details: packet,
    }).catch(() => null),
  ]);
}

export async function updateStates(insertedData: preparedLiveData, previousData: previousPreparedLiveData) {
  const { starter_id, motor_id, power_present, motor_state, mode_description, alert_code,
    alert_description, fault, fault_description, time_stamp, temp, avg_current } = insertedData;
  const { power, prevState, prevMode, locationId, created_by, motor, device_created_by, starter_number } = extractPreviousData(previousData, motor_id);
  if (!starter_id) return null;

  const isInTestRun = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["starter_id", "id", "test_run_status"], ["=", "=", "="], [starter_id, motor_id, "PROCESSING"], ["test_run_status"]);
  if (isInTestRun && isInTestRun.test_run_status === "PROCESSING") await updateLatestStarterSettingsFlc(starter_id, motor_id, avg_current)

  const record = prepareStarterParametersRecord(insertedData);
  try {
    const notificationData = await db.transaction(async (trx) => {
      // Lock the motor row FIRST (exclusive) — before the inserts below take a FOR SHARE lock
      // on it via their motor_id foreign key. Taking the FOR UPDATE lock up front gives every
      // concurrent live-data transaction the same lock order, avoiding the SHARE→UPDATE lock
      // upgrade that was deadlocking (40P01).
      const lockedMotorRecord = motor_id ? await getLockedMotorSnapshot(trx, motor_id) : null;

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
        if (trackPowerChange) {
          await ActivityService.writeDevicePowerLog((created_by ?? device_created_by) as number, starter_id, power, power_present as number, trx);
        }
      }

      let effectivePrevState = prevState;
      let effectivePrevMode = prevMode;
      let effectiveCreatedBy = created_by || device_created_by;
      let effectiveLocationId = locationId;
      let notificationMotor = motor;

      if (motor_id) {
        // Reuse the snapshot taken (and row lock acquired) at the top of the transaction.
        const currentMotorRecord = lockedMotorRecord;
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
          actual_started_at: insertedData.active_schedule_started_at,
          actual_ended_at: insertedData.active_schedule_ended_at,
          actual_run_time: insertedData.active_schedule_runtime_minutes,
          actual_type: insertedData.active_schedule_type,
          missed_minutes: insertedData.active_schedule_missed_minutes,
          failure_at: insertedData.active_schedule_failure_at,
          failure_reason: insertedData.active_schedule_failure_reason,
          failure_code: insertedData.active_failure_code || 0,
          device_schedule_status: insertedData.active_schedule_status,
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

    if (motor_id && starter_id) {
      handleScheduleLiveData(insertedData, motor_id, starter_id).catch(() => null);
      uploadLiveDataPacket(starter_id, insertedData as any, insertedData.time_stamp).catch(() => null);
    }

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
  if (isInTestRun && isInTestRun.test_run_status === "PROCESSING") await updateLatestStarterSettingsFlc(starter_id, motor_id, avg_current);

  const record = prepareStarterParametersRecord(insertedData);
  const notificationData = await db.transaction(async (trx) => {
    // Lock the motor row FIRST to avoid the SHARE→UPDATE lock-upgrade deadlock (see updateStates).
    const lockedMotorRecord = await getLockedMotorSnapshot(trx, motor_id);

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
        await ActivityService.writeDevicePowerLog((created_by ?? device_created_by) as number, starter_id, power, power_present as number, trx);
      }
    }

    let effectivePrevState = prevState;
    let effectivePrevMode = prevMode;
    let effectiveCreatedBy = created_by || device_created_by;
    let effectiveLocationId = locationId;
    let notificationMotor = motor;

    if (motor_id) {
      const currentMotorRecord = lockedMotorRecord;
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
        actual_started_at: insertedData.active_schedule_started_at,
        actual_ended_at: insertedData.active_schedule_ended_at,
        actual_run_time: insertedData.active_schedule_runtime_minutes,
        actual_type: insertedData.active_schedule_type,
        missed_minutes: insertedData.active_schedule_missed_minutes,
        failure_at: insertedData.active_schedule_failure_at,
        failure_reason: insertedData.active_schedule_failure_reason,
        failure_code: insertedData.active_failure_code || 0,
        device_schedule_status: insertedData.active_schedule_status,
      }, trx);
    }

    const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(notificationMotor, motor_state, mode_description, starter_id, starter_number) : null;
    const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(notificationMotor, mode_description, starter_id, starter_number) : null;

    const isAlertRaised = alertCodeChange.isDetected;
    const isAlertCleared = alertCodeChange.isCleared;
    const isFaultRaised = faultCodeChange.isDetected;
    const isFaultCleared = faultCodeChange.isCleared;
    const pumpName = notificationMotor.alias_name ?? starter_number;
    const notifUserId = created_by || device_created_by;

    const notificationDataAlert = isAlertRaised ? prepareAlertNotificationData({ alertCode: currentAlertCode, alertDescription: alert_description, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataAlertCleared = isAlertCleared ? prepareAlertClearedNotificationData({ currentAlertCode, previousAlertCode: latestAlertsFaultsSnapshot?.alert_code ?? null, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataFault = isFaultRaised ? prepareFaultNotificationData({ faultCode: currentFaultCode, faultDescription: fault_description, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataFaultCleared = isFaultCleared ? prepareFaultClearedNotificationData({ currentFaultCode, previousFaultCode: latestAlertsFaultsSnapshot?.fault_code ?? null, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;

    return { notificationDataState, notificationDataMode, notificationDataAlert, notificationDataAlertCleared, notificationDataFault, notificationDataFaultCleared };
  });

  if (motor_id && starter_id) {
    handleScheduleLiveData(insertedData, motor_id, starter_id).catch(() => null);
    uploadLiveDataPacket(starter_id, insertedData as any, insertedData.time_stamp).catch(() => null);
  }

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
  if (notificationData.notificationDataAlert) {
    if (shouldSendNotification(notificationData.notificationDataAlert.motorId, "alert", alert_code ?? 0)) {
      await sendUserNotification(notificationData.notificationDataAlert.userId, notificationData.notificationDataAlert.title, notificationData.notificationDataAlert.message, notificationData.notificationDataAlert.motorId, notificationData.notificationDataAlert.starter_id);
    }
  }
  if (notificationData.notificationDataAlertCleared) {
    if (shouldSendNotification(notificationData.notificationDataAlertCleared.motorId, "alert_cleared", 0)) {
      await sendUserNotification(notificationData.notificationDataAlertCleared.userId, notificationData.notificationDataAlertCleared.title, notificationData.notificationDataAlertCleared.message, notificationData.notificationDataAlertCleared.motorId, notificationData.notificationDataAlertCleared.starter_id);
    }
  }
  if (notificationData.notificationDataFault) {
    if (shouldSendNotification(notificationData.notificationDataFault.motorId, "fault", fault ?? 0)) {
      await sendUserNotification(notificationData.notificationDataFault.userId, notificationData.notificationDataFault.title, notificationData.notificationDataFault.message, notificationData.notificationDataFault.motorId, notificationData.notificationDataFault.starter_id);
    }
  }
  if (notificationData.notificationDataFaultCleared) {
    if (shouldSendNotification(notificationData.notificationDataFaultCleared.motorId, "fault_cleared", 0)) {
      await sendUserNotification(notificationData.notificationDataFaultCleared.userId, notificationData.notificationDataFaultCleared.title, notificationData.notificationDataFaultCleared.message, notificationData.notificationDataFaultCleared.motorId, notificationData.notificationDataFaultCleared.starter_id);
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
    // Lock the motor row FIRST to avoid the SHARE→UPDATE lock-upgrade deadlock (see updateStates).
    const lockedMotorRecord = await getLockedMotorSnapshot(trx, motor_id);

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
        await ActivityService.writeDevicePowerLog((created_by ?? device_created_by) as number, starter_id, power, power_present as number, trx);
      }
    }

    const currentMotorRecord = lockedMotorRecord;
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

    const isAlertRaised = alertCodeChange.isDetected;
    const isAlertCleared = alertCodeChange.isCleared;
    const isFaultRaised = faultCodeChange.isDetected;
    const isFaultCleared = faultCodeChange.isCleared;
    const pumpName = notificationMotor.alias_name ?? starter_number;
    const notifUserId = created_by || device_created_by;

    const notificationDataAlert = isAlertRaised ? prepareAlertNotificationData({ alertCode: currentAlertCode, alertDescription: alert_description, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataAlertCleared = isAlertCleared ? prepareAlertClearedNotificationData({ currentAlertCode, previousAlertCode: latestAlertsFaultsSnapshot?.alert_code ?? null, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataFault = isFaultRaised ? prepareFaultNotificationData({ faultCode: currentFaultCode, faultDescription: fault_description, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataFaultCleared = isFaultCleared ? prepareFaultClearedNotificationData({ currentFaultCode, previousFaultCode: latestAlertsFaultsSnapshot?.fault_code ?? null, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;

    // Update actual schedule fields with device-reported values
    if (insertedData.active_schedule_id && motor_id && starter_id) {
      await updateActualScheduleFields(motor_id, starter_id, insertedData.active_schedule_id, {
        actual_start_time: insertedData.active_schedule_start_time,
        actual_end_time: insertedData.active_schedule_end_time,
        actual_started_at: insertedData.active_schedule_started_at,
        actual_ended_at: insertedData.active_schedule_ended_at,
        actual_run_time: insertedData.active_schedule_runtime_minutes,
        actual_type: insertedData.active_schedule_type,
        missed_minutes: insertedData.active_schedule_missed_minutes,
        failure_at: insertedData.active_schedule_failure_at,
        failure_reason: insertedData.active_schedule_failure_reason,
        failure_code: insertedData.active_failure_code || 0,
        device_schedule_status: insertedData.active_schedule_status,
      }, trx);
    }

    return { notificationDataState, notificationDataAlert, notificationDataAlertCleared, notificationDataFault, notificationDataFaultCleared };
  });

  if (motor_id && starter_id) {
    handleScheduleLiveData(insertedData, motor_id, starter_id).catch(() => null);
    uploadLiveDataPacket(starter_id, insertedData as any, insertedData.time_stamp).catch(() => null);
  }

  if (notificationData.notificationDataState) {
    if (shouldSendNotification(notificationData.notificationDataState.motorId, "state", motor_state)) {
      await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
    }
  }
  if (notificationData.notificationDataAlert) {
    if (shouldSendNotification(notificationData.notificationDataAlert.motorId, "alert", alert_code ?? 0)) {
      await sendUserNotification(notificationData.notificationDataAlert.userId, notificationData.notificationDataAlert.title, notificationData.notificationDataAlert.message, notificationData.notificationDataAlert.motorId, notificationData.notificationDataAlert.starter_id);
    }
  }
  if (notificationData.notificationDataAlertCleared) {
    if (shouldSendNotification(notificationData.notificationDataAlertCleared.motorId, "alert_cleared", 0)) {
      await sendUserNotification(notificationData.notificationDataAlertCleared.userId, notificationData.notificationDataAlertCleared.title, notificationData.notificationDataAlertCleared.message, notificationData.notificationDataAlertCleared.motorId, notificationData.notificationDataAlertCleared.starter_id);
    }
  }
  if (notificationData.notificationDataFault) {
    if (shouldSendNotification(notificationData.notificationDataFault.motorId, "fault", fault ?? 0)) {
      await sendUserNotification(notificationData.notificationDataFault.userId, notificationData.notificationDataFault.title, notificationData.notificationDataFault.message, notificationData.notificationDataFault.motorId, notificationData.notificationDataFault.starter_id);
    }
  }
  if (notificationData.notificationDataFaultCleared) {
    if (shouldSendNotification(notificationData.notificationDataFaultCleared.motorId, "fault_cleared", 0)) {
      await sendUserNotification(notificationData.notificationDataFaultCleared.userId, notificationData.notificationDataFaultCleared.title, notificationData.notificationDataFaultCleared.message, notificationData.notificationDataFaultCleared.motorId, notificationData.notificationDataFaultCleared.starter_id);
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
    // Lock the motor row FIRST to avoid the SHARE→UPDATE lock-upgrade deadlock (see updateStates).
    const lockedMotorRecord = await getLockedMotorSnapshot(trx, motor_id);

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
        await ActivityService.writeDevicePowerLog((created_by ?? device_created_by) as number, starter_id, power, power_present as number, trx);
      }
    }

    const currentMotorRecord = lockedMotorRecord;
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

    const isAlertRaised = alertCodeChange.isDetected;
    const isAlertCleared = alertCodeChange.isCleared;
    const isFaultRaised = faultCodeChange.isDetected;
    const isFaultCleared = faultCodeChange.isCleared;
    const pumpName = notificationMotor.alias_name ?? starter_number;
    const notifUserId = created_by || device_created_by;

    const notificationDataAlert = isAlertRaised ? prepareAlertNotificationData({ alertCode: currentAlertCode, alertDescription: alert_description, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataAlertCleared = isAlertCleared ? prepareAlertClearedNotificationData({ currentAlertCode, previousAlertCode: latestAlertsFaultsSnapshot?.alert_code ?? null, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataFault = isFaultRaised ? prepareFaultNotificationData({ faultCode: currentFaultCode, faultDescription: fault_description, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;
    const notificationDataFaultCleared = isFaultCleared ? prepareFaultClearedNotificationData({ currentFaultCode, previousFaultCode: latestAlertsFaultsSnapshot?.fault_code ?? null, userId: notifUserId, motorId: motor_id, starterId: starter_id, pumpName }) : null;

    // Update actual schedule fields with device-reported values
    if (insertedData.active_schedule_id && motor_id && starter_id) {
      await updateActualScheduleFields(motor_id, starter_id, insertedData.active_schedule_id, {
        actual_start_time: insertedData.active_schedule_start_time,
        actual_end_time: insertedData.active_schedule_end_time,
        actual_started_at: insertedData.active_schedule_started_at,
        actual_ended_at: insertedData.active_schedule_ended_at,
        actual_run_time: insertedData.active_schedule_runtime_minutes,
        actual_type: insertedData.active_schedule_type,
        missed_minutes: insertedData.active_schedule_missed_minutes,
        failure_at: insertedData.active_schedule_failure_at,
        failure_reason: insertedData.active_schedule_failure_reason,
        failure_code: insertedData.active_failure_code || 0,
        device_schedule_status: insertedData.active_schedule_status,
      }, trx);
    }

    return { notificationDataMode, notificationDataAlert, notificationDataAlertCleared, notificationDataFault, notificationDataFaultCleared };
  });

  if (motor_id && starter_id) {
    handleScheduleLiveData(insertedData, motor_id, starter_id).catch(() => null);
    uploadLiveDataPacket(starter_id, insertedData as any, insertedData.time_stamp).catch(() => null);
  }

  if (notificationData.notificationDataMode) {
    if (shouldSendNotification(notificationData.notificationDataMode.motorId, "mode", mode_description)) {
      await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
    }
  }
  if (notificationData.notificationDataAlert) {
    if (shouldSendNotification(notificationData.notificationDataAlert.motorId, "alert", alert_code ?? 0)) {
      await sendUserNotification(notificationData.notificationDataAlert.userId, notificationData.notificationDataAlert.title, notificationData.notificationDataAlert.message, notificationData.notificationDataAlert.motorId, notificationData.notificationDataAlert.starter_id);
    }
  }
  if (notificationData.notificationDataAlertCleared) {
    if (shouldSendNotification(notificationData.notificationDataAlertCleared.motorId, "alert_cleared", 0)) {
      await sendUserNotification(notificationData.notificationDataAlertCleared.userId, notificationData.notificationDataAlertCleared.title, notificationData.notificationDataAlertCleared.message, notificationData.notificationDataAlertCleared.motorId, notificationData.notificationDataAlertCleared.starter_id);
    }
  }
  if (notificationData.notificationDataFault) {
    if (shouldSendNotification(notificationData.notificationDataFault.motorId, "fault", fault ?? 0)) {
      await sendUserNotification(notificationData.notificationDataFault.userId, notificationData.notificationDataFault.title, notificationData.notificationDataFault.message, notificationData.notificationDataFault.motorId, notificationData.notificationDataFault.starter_id);
    }
  }
  if (notificationData.notificationDataFaultCleared) {
    if (shouldSendNotification(notificationData.notificationDataFaultCleared.motorId, "fault_cleared", 0)) {
      await sendUserNotification(notificationData.notificationDataFaultCleared.userId, notificationData.notificationDataFaultCleared.title, notificationData.notificationDataFaultCleared.message, notificationData.notificationDataFaultCleared.motorId, notificationData.notificationDataFaultCleared.starter_id);
    }
  }
}


// Motor control ack — D is a map of one or more motor slots, e.g. { m1: 1, m2: 6 }.
// Only STATUS_OFF(0)/STATUS_ON(1) are real state transitions; codes 2-8 are
// rejection reasons (fault, already on/off, invalid request, ...) reported back
// by the device instead of an actuation, and must not be written to motors.state.
export async function motorControlAckHandler(message: any, topic: string) {
  const macAddress = topic.split("/")[1];
  try {
    if (!macAddress) {
      console.error("Invalid topic format: MAC address not found");
      return;
    }

    const validMac = await getStarterByMacWithMotor(macAddress);
    if (!validMac?.id || !validMac.motors || validMac.motors.length === 0) {
      console.error(`No starter found with MAC address [${macAddress}] or no motors attached`);
      return;
    }

    // Multi-motor devices send D as a map ({ m1: 0, m2: 1 }); single-motor devices
    // send a bare scalar (D: 0). Normalize both to the map form so single-motor state
    // acks are actually persisted instead of silently dropped by Object.entries.
    const ackData: Record<string, number> = normalizeDeviceAckD(message?.D);
    const motorsByIndex = new Map(validMac.motors.map((m: any) => [m.motor_index ?? 1, m]));
    const starter_id = validMac.id;

    const notifications: Array<{ userId: number; title: string; message: string; motorId: number; starterId: number }> = [];
    const debouncedStateResults: Array<{ motorId: number; newState: number }> = [];

    await db.transaction(async (trx) => {
      for (const [key, rawState] of Object.entries(ackData)) {
        const motorIndex = parseMotorKey(key);
        const motor: any = motorIndex !== null ? motorsByIndex.get(motorIndex) : undefined;
        if (!motor) {
          logger.warn(`[motor-control-ack] Unknown motor slot "${key}" on starter ${macAddress} (starter_id=${starter_id}) — skipping`);
          continue;
        }

        const newState = Number(rawState);
        const motor_id = motor.id;
        const location_id = motor.location_id;
        const mode_description = motor.mode;
        const prevState = motor.state;
        const isStateCode = isMotorControlStateCode(newState);
        const stateChanged = isStateCode && newState !== prevState;

        if (stateChanged) {
          const updateData: any = { state: newState, updated_at: new Date() };
          if (newState === 1) updateData.motor_last_on_at = new Date();
          else updateData.motor_last_off_at = new Date();
          await trx.update(motors).set(updateData).where(eq(motors.id, motor_id));

          await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);

          await writeMotorStatusHistoryIfChanged({
            starter_id,
            motor_id,
            status: newState === 1 ? "ON" : "OFF",
            time_stamp: new Date(),
            trx,
          });
        } else if (isStateCode) {
          const isFirstRecord = motor_id ? !(await hasMotorRunTimeRecord(motor_id, starter_id, trx)) : false;
          if (isFirstRecord) {
            await trackMotorRunTime({ starter_id, motor_id, location_id, previous_state: prevState, new_state: newState, mode_description }, trx);
          }
        } else {
          // Rejection/error code (fault, already on/off, invalid request, ...) — log only.
          logger.warn(`[motor-control-ack] starter=${starter_id} motor=${motor_id} (${key}) rejected: ${getMotorControlStatusDescription(newState)} (code=${newState})`);
        }

        // Always log the ACK itself (changed or not), same as before.
        await ActivityService.writeMotorAckLogs(
          motor.created_by || validMac.created_by,
          motor_id,
          { state: prevState, mode: mode_description },
          { state: isStateCode ? newState : prevState, mode: mode_description },
          "MOTOR_CONTROL_ACK",
          trx,
          starter_id,
        );

        if (stateChanged) {
          const notificationData = prepareMotorStateControlNotificationData(motor, newState, mode_description, starter_id, validMac.starter_number);
          if (notificationData) {
            notifications.push(notificationData);
            debouncedStateResults.push({ motorId: motor_id, newState });
          }
        }
      }
    });

    // Resolve any in-flight REST request waiting on this ack (sendMotorControlCommand).
    const pendingAck = motorControlPendingAckMap.get(macAddress);
    if (pendingAck && pendingAck.sequenceNumber === message.S) {
      pendingAck.resolve({ acked: true, data: ackData });
    }

    // Send notifications after the transaction commits (debounced per motor).
    for (let i = 0; i < notifications.length; i++) {
      const n = notifications[i];
      const { newState } = debouncedStateResults[i];
      if (shouldSendNotification(n.motorId, "state", newState)) {
        await sendUserNotification(n.userId, n.title, n.message, n.motorId, n.starterId);
      }
    }
  } catch (error: any) {
    logger.error("Error at motor control ack handler", error);
    console.error("Error at motor control ack handler", error);
    throw error;
  }
}

// Motor mode ack — D is a map of one or more motor slots, e.g. { m1: 1, m2: 6 }.
// Only codes 0/1/2 (MANUAL/AUTO/SCHEDULE) are real mode transitions; codes 3-8 are
// rejection reasons (fault, already manual/auto, invalid request, ...) reported
// back by the device instead of a mode change, and must not be written to motors.mode.
export async function motorModeChangeAckHandler(message: any, topic: string) {
  const macAddress = topic.split("/")[1];
  try {
    const validMac = await getStarterByMacWithMotor(macAddress);
    if (!validMac?.id || !validMac.motors.length) {
      logger.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };

    // Multi-motor devices send D as a map ({ m1: 0, m2: 1 }); single-motor devices
    // send a bare scalar (D: 0). Normalize both to the map form so single-motor mode
    // acks are actually persisted instead of silently dropped by Object.entries.
    const ackData: Record<string, number> = normalizeDeviceAckD(message?.D);
    const motorsByIndex = new Map(validMac.motors.map((m: any) => [m.motor_index ?? 1, m]));
    const starter_id = validMac.id;

    const notifications: Array<{ userId: number; title: string; message: string; motorId: number; starterId: number }> = [];
    const debouncedModeResults: Array<{ motorId: number; newMode: string }> = [];

    await db.transaction(async (trx) => {
      for (const [key, rawCode] of Object.entries(ackData)) {
        const motorIndex = parseMotorKey(key);
        const motor: any = motorIndex !== null ? motorsByIndex.get(motorIndex) : undefined;
        if (!motor) {
          logger.warn(`[mode-control-ack] Unknown motor slot "${key}" on starter ${macAddress} (starter_id=${starter_id}) — skipping`);
          continue;
        }

        const code = Number(rawCode);
        const motor_id = motor.id;
        const prevMode = motor.mode;
        const newMode = modeControlCodeToMode(code);
        const modeChanged = newMode !== null && newMode !== prevMode;

        if (modeChanged) {
          await trx.update(motors).set({ mode: newMode as any, last_mode_change_at: new Date(), updated_at: new Date() }).where(eq(motors.id, motor_id));
        } else if (newMode === null) {
          // Rejection/error code (fault, already manual/auto, invalid request, ...) — log only.
          logger.warn(`[mode-control-ack] starter=${starter_id} motor=${motor_id} (${key}) rejected: ${getModeControlStatusDescription(code)} (code=${code})`);
        }

        // Always log the ACK itself (changed or not), same as before.
        await ActivityService.writeMotorAckLogs(
          motor.created_by || validMac.created_by,
          motor_id,
          { mode: prevMode },
          { mode: newMode ?? prevMode },
          "MOTOR_MODE_ACK",
          trx,
          starter_id,
        );

        if (modeChanged) {
          const notificationData = prepareMotorModeControlNotificationData(motor, newMode, starter_id, validMac.starter_number);
          if (notificationData) {
            notifications.push(notificationData);
            debouncedModeResults.push({ motorId: motor_id, newMode: newMode as string });
          }
        }
      }
    });

    // Resolve any in-flight REST request waiting on this ack (sendModeControlCommand).
    const pendingAck = modeControlPendingAckMap.get(macAddress);
    if (pendingAck && pendingAck.sequenceNumber === message.S) {
      pendingAck.resolve({ acked: true, data: ackData });
    }

    // Send notifications after the transaction commits (debounced per motor).
    for (let i = 0; i < notifications.length; i++) {
      const n = notifications[i];
      const { newMode } = debouncedModeResults[i];
      if (shouldSendNotification(n.motorId, "mode", newMode)) {
        await sendUserNotification(n.userId, n.title, n.message, n.motorId, n.starterId);
      }
    }
  } catch (error: any) {
    logger.error("Error at motor mode change ack handler", error);
    console.error("Error at motor mode change ack handler", error);
    throw error;
  }
}


// Fault-clear ack (2.0-only, T:37 — see ACK_TYPES_V2.FAULT_CLEAR_ACK). D is a map of the
// motor slots the device is reporting on, e.g. { m1: 1 } or { m1: 1, m2: 1 }; a value of 1
// means that motor's fault is cleared on the device side, so flip fault_cleared on its
// latest active fault row. Scoped to starter_id AND motor_id — same query faultClearedHandler
// (the manual "Clear Fault" REST endpoint) uses — so a dual-motor box's two motors are never
// mixed up.
export async function faultClearAckHandler(message: any, topic: string) {
  const macAddress = topic.split("/")[1];
  try {
    if (!macAddress) {
      logger.error("[fault-clear-ack] Invalid topic format: MAC address not found");
      return;
    }

    const validMac = await getStarterByMacWithMotor(macAddress);
    if (!validMac?.id || !validMac.motors || validMac.motors.length === 0) {
      logger.error(`[fault-clear-ack] No starter found with MAC [${macAddress}] or no motors attached`);
      return;
    }

    const ackData: Record<string, number> = normalizeDeviceAckD(message?.D);
    const motorsByIndex = new Map(validMac.motors.map((m: any) => [m.motor_index ?? 1, m]));
    const starter_id = validMac.id;
    const orderBy: OrderByQueryData<StarterBoxParametersTable> = { columns: ["id"], values: ["desc"] };

    for (const [key, rawValue] of Object.entries(ackData)) {
      if (Number(rawValue) !== 1) continue; // only a "cleared" report acts; anything else is ignored

      const motorIndex = parseMotorKey(key);
      const motor: any = motorIndex !== null ? motorsByIndex.get(motorIndex) : undefined;
      if (!motor) {
        logger.warn(`[fault-clear-ack] Unknown motor slot "${key}" on starter ${macAddress} (starter_id=${starter_id}) — skipping`);
        continue;
      }

      const faultRecord = await getSingleRecordByMultipleColumnValues<StarterBoxParametersTable>(starterBoxParameters,
        ["starter_id", "motor_id", "fault", "fault_cleared"], ["=", "=", "!=", "="],
        [starter_id, motor.id, 0, false], ["id"], orderBy
      );

      if (!faultRecord) {
        logger.warn(`[fault-clear-ack] starter=${starter_id} motor=${motor.id} (${key}) acked but no active fault row found — skipping`);
        continue;
      }

      await updateRecordById<StarterBoxParametersTable>(starterBoxParameters, faultRecord.id, { fault_cleared: true });
      await ActivityService.logActivity({
        performedBy: motor.created_by || validMac.created_by,
        action: "FAULT_CLEARED_BY_DEVICE",
        entityType: "STARTER",
        entityId: starter_id,
        newData: { motor_id: motor.id, fault_record_id: faultRecord.id, motor_name: motor.alias_name ?? motor.name },
      });
    }
  } catch (error: any) {
    logger.error("Error at fault clear ack handler", error);
    console.error("Error at fault clear ack handler", error);
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
    const heartbeatAt = new Date();
    const { strength, status } = getValidStrength(message.D.s_q);
    const validNetwork = getValidNetwork(message.D.nwt);
    const statusChanged = validMac.status !== status;
    const signalChanged = validMac.signal_quality !== strength;
    const networkChanged = validMac.network_type !== validNetwork;

    const starterBoxUpdates: any = { last_signal_received_at: heartbeatAt };
    if (signalChanged || networkChanged || statusChanged) {
      starterBoxUpdates.signal_quality = strength;
      starterBoxUpdates.network_type = validNetwork;
      starterBoxUpdates.status = status;
    }

    if (statusChanged) {
      await writeDeviceStatusHistoryIfChanged({
        starter_id: validMac.id,
        status,
        time_stamp: heartbeatAt,
      });
    }

    await db.transaction(async (trx) => {
      await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, validMac.id, starterBoxUpdates, trx);

      // Heartbeat-driven config sync, bounded. The gate below is the only automatic
      // publisher of a box's stored (initially default) settings, and it re-fires on
      // every heartbeat until the device acks — which for a box that never acks means
      // forever, plus one new pending starter_settings row per cycle. Cap the number of
      // cycles; the count is cleared on a successful ack, and an admin can re-arm a
      // given box via PATCH /starters/:id (updateSettingsSyncStatusHandler).
      if (message.D.s_q >= 2 && message.D.s_q <= 40 && validMac.synced_settings_status === "false") {
        const syncAttempts = getSettingsSyncAttempts(validMac.id);
        if (syncAttempts >= MAX_SETTINGS_SYNC_ATTEMPTS) {
          // Log once, on the heartbeat that crosses the limit — not on every later one.
          if (syncAttempts === MAX_SETTINGS_SYNC_ATTEMPTS) {
            incrementSettingsSyncAttempts(validMac.id);
            logger.warn(`Settings sync abandoned for starter ${validMac.id} after ${MAX_SETTINGS_SYNC_ATTEMPTS} unacknowledged attempts; re-arm to retry.`);
          }
        } else {
          incrementSettingsSyncAttempts(validMac.id);
          await publishDeviceSettings(validMac);
        }
      }
    });

    // Heartbeat-driven schedule push: whenever the device is online (signal 1–30),
    // check for unacknowledged schedules and push them. The push helper early-returns
    // if there are no pending rows, so calling it on every heartbeat is cheap
    // (one DB query) — but it means a freshly created schedule reaches the device
    // on the very next heartbeat, regardless of prior connection state.
    // Fire-and-forget so the heartbeat handler never blocks on MQTT ACK timeouts.
    const isNowOnline = strength != null && strength >= 1 && strength <= 30;
    if (isNowOnline) {
      const motorList = Array.isArray((validMac as any).motors) ? (validMac as any).motors : [];
      setImmediate(() => {
        if (motorList.length === 0) {
          pushPendingSchedulesForStarter(validMac, undefined, undefined, true).catch((err) =>
            logger.error(`heartbeat schedule push failed for starter ${validMac.id}: ${err?.message}`),
          );
          return;
        }
        for (const motor of motorList) {
          pushPendingSchedulesForStarter(validMac, motor.id, undefined, true).catch((err) =>
            logger.error(`heartbeat schedule push failed for starter ${validMac.id} motor ${motor.id}: ${err?.message}`),
          );
        }
      });
    }
  } catch (error: any) {
    console.error("Error at heartbeat topic handler:", error);
    throw error;
  }
}

export async function deviceSerialNumberAllocationAckHandler(message: any, topic: string) {
  try {
    const identifier = topic.split("/")[1];
    const upperId = identifier?.trim().toUpperCase();
    if (!upperId) return null;

    const byMac = await db.query.starterBoxes.findFirst({
      where: and(eq(starterBoxes.mac_address, upperId), ne(starterBoxes.status, "ARCHIVED")),
      columns: { id: true, user_id: true, created_by: true, device_allocation: true },
    });
    const matchType = byMac ? "mac" : "pcb";
    const starter = byMac ?? await db.query.starterBoxes.findFirst({
      where: and(eq(starterBoxes.pcb_number, upperId), ne(starterBoxes.status, "ARCHIVED")),
      columns: { id: true, user_id: true, created_by: true, device_allocation: true },
    });

    if (!starter?.id) {
      console.error(`No starter found with identifier [${upperId}]`);
      return null;
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
    console.error("Error at device serial number allocation ack handler:", error);
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
  const macFromTopic = topic.split("/")[1];

  try {
    if (!macFromTopic) {
      console.error("Invalid topic format: MAC/PCB not found");
      return null;
    }

    // MULTI_STARTER boxes send a per-motor ack (D: { m1: 0|1, m2: 0|1, ... }) instead
    // of the scalar D:0|1 below — the shape itself is a safe discriminator, since
    // SINGLE_STARTER firmware only ever sends the scalar and MULTI_STARTER firmware
    // only ever sends the object. The scalar branch beneath this one is untouched.
    if (message.D !== null && typeof message.D === "object") {
      const pendingAck = settingsControlPendingAckMap.get(macFromTopic);

      if (!pendingAck) {
        logger.warn(`No pending multi-motor settings ACK found for ${macFromTopic}`);
        return null;
      }

      if (pendingAck.sequenceNumber !== message.S) {
        logger.warn(`Sequence number mismatch for multi-motor settings ACK ${macFromTopic}: expected ${pendingAck.sequenceNumber}, received ${message.S}`);
        return null;
      }

      const ackData: Record<string, number> = message.D;
      pendingAck.resolve({ acked: true, data: ackData });
      settingsControlPendingAckMap.delete(macFromTopic);

      const validMac = await getStarterByMacWithMotor(macFromTopic);
      if (validMac?.id) {
        const allAcked = await updateMultiMotorSettingsAck(validMac.id, ackData);
        logger.info(`[multi-motor-settings] ack applied for starter=${validMac.id} allAcked=${allAcked}`);

        if (allAcked && validMac.synced_settings_status === "false") {
          await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, { synced_settings_status: "true" });
        }
        // Only a full ack counts as synced — a partial one leaves the count in place so
        // the remaining motors still get their bounded retries.
        if (allAcked) clearSettingsSyncAttempts(validMac.id);
      }

      return null;
    }

    if (message.D === undefined || message.D === null || (message.D !== 0 && message.D !== 1)) {
      console.error(`Invalid message data in calibration ack [${message.D}]`);
      return null;
    }

    // Match PCB/MAC and sequence number from pendingAckMap
    const pendingAck = pendingAckMap.get(macFromTopic);

    if (!pendingAck) {
      // Shape/version mismatch: a V2.0 box published through the per-motor path (which
      // registers in settingsControlPendingAckMap) but replied with the legacy scalar.
      // Trust the device — resolve the per-motor wait with the scalar folded into slot 1
      // rather than dropping the ack and republishing forever.
      const pendingSettingsAck = settingsControlPendingAckMap.get(macFromTopic);
      if (pendingSettingsAck) {
        if (pendingSettingsAck.sequenceNumber !== message.S) {
          logger.warn(`Sequence number mismatch for scalar settings ACK ${macFromTopic}: expected ${pendingSettingsAck.sequenceNumber}, received ${message.S}`);
          return null;
        }
        const ackData = normalizeDeviceAckD(message.D);
        pendingSettingsAck.resolve({ acked: true, data: ackData });
        settingsControlPendingAckMap.delete(macFromTopic);
        logger.warn(`[payload-version] ${macFromTopic} acked T:34 with a scalar on the per-motor path; honouring it as ${JSON.stringify(ackData)}`);

        const validMac = await getStarterByMacWithMotor(macFromTopic);
        if (validMac?.id) {
          const allAcked = await updateMultiMotorSettingsAck(validMac.id, ackData);
          if (allAcked && validMac.synced_settings_status === "false") {
            await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, { synced_settings_status: "true" });
          }
          if (allAcked) clearSettingsSyncAttempts(validMac.id);
        }
        return null;
      }

      logger.warn(`No pending ACK found for ${macFromTopic}`);
      return null;
    }

    // Validate sequence number matches
    if (pendingAck.sequenceNumber !== undefined && pendingAck.sequenceNumber !== message.S) {
      logger.warn(`Sequence number mismatch for ${macFromTopic}: expected ${pendingAck.sequenceNumber}, received ${message.S}`);
      return null;
    }

    if (message.D === 1) {
      // ACK success — resolve true so caller proceeds with DB update
      pendingAck.resolve(true);
      pendingAckMap.delete(macFromTopic);
      logger.info(`Calibration ACK success for ${macFromTopic}`);

      // Update DB: mark settings as acknowledged
      const validMac = await getStarterByMacWithMotor(macFromTopic);
      if (validMac?.id) {
        await updateLatestStarterSettings(validMac.id, message.D);

        if (validMac.synced_settings_status === "false") {
          await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, { synced_settings_status: "true" });
        }
        clearSettingsSyncAttempts(validMac.id);
      }
    } else {
      // ACK failed (D === 0) — resolve false, do NOT update DB
      pendingAck.resolve(false);
      pendingAckMap.delete(macFromTopic);
      logger.warn(`Calibration ACK failed (D=0) for ${macFromTopic}, skipping DB update`);
    }

  } catch (error: any) {
    // On error, reject whichever pending ACK was in flight so the caller doesn't hang.
    const pendingAck = pendingAckMap.get(macFromTopic);
    if (pendingAck) {
      pendingAck.resolve(false);
      pendingAckMap.delete(macFromTopic);
    }
    const pendingSettingsAck = settingsControlPendingAckMap.get(macFromTopic);
    if (pendingSettingsAck) {
      pendingSettingsAck.resolve({ acked: false });
      settingsControlPendingAckMap.delete(macFromTopic);
    }
    console.error("Error at device sync update (calibration ack):", error);
    throw error;
  }
}

export async function adminConfigDataRequestAckHandler(
  message: any,
  topic: string
) {
  try {
    const macFromTopic = topic.split("/")[1];

    const validMac = await getStarterByMacWithMotor(macFromTopic);

    if (!validMac?.id) {
      console.error(`No starter found with given MAC [${topic}]`);
      return null;
    }

    if (
      message.D === undefined ||
      message.D === null ||
      (message.D !== 0 && message.D !== 1)
    ) {
      console.error(
        `Invalid message data in admin config ack [${message.D}]`
      );
      return null;
    }

    //  Resolve ACK to stop retries
    const pendingAck = pendingAckMap.get(macFromTopic);

    if (pendingAck) {
      pendingAck.resolve(true);
      pendingAckMap.delete(macFromTopic);
    }

    // Update DB
    await updateLatestStarterSettings(validMac.id, message.D);

    if (
      validMac &&
      validMac.synced_settings_status === "false"
    ) {
      await updateRecordById<StarterBoxTable>(
        starterBoxes,
        validMac.id,
        { synced_settings_status: "true" }
      );
    }
    clearSettingsSyncAttempts(validMac.id);

  } catch (error: any) {
    console.error("Error at admin config ack handler:", error);
    throw error;
  }
}


export async function deviceResetAckHandler(message: any, topic: string) {
  try {
    const macFromTopic = topic.split("/")[1];
    const validMac = await getStarterByMacWithMotor(macFromTopic);
    if (!validMac?.id) {
      console.error(`No starter found with given MAC [${topic}]`);
      return null;
    }

    if (message.D === undefined || message.D === null || (message.D !== 0 && message.D !== 1)) {
      console.error(`Invalid message data in admin config ack [${message.D}]`);
      return null;
    }

    const updatedFields = { device_reset_status: message.D === 1 ? "true" : "false" };
    const changedStatus = validMac.device_reset_status !== updatedFields.device_reset_status;
    if (changedStatus) await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, updatedFields);
  } catch (error: any) {
    console.error("Error at device reset ack topic:", error);
    throw error;
  }
}

export async function deviceInfoAckHandler(message: any, topic: string) {
  const macFromTopic = topic.split("/")[1];
  const updatedFields: Record<string, any> = {};
  try {
    // Resolve pending ACK to stop retry publishing
    const pendingAck = pendingAckMap.get(macFromTopic);
    if (pendingAck) {
      pendingAck.resolve(true);
      pendingAckMap.delete(macFromTopic);
    }

    const validMac = await getStarterByMacWithMotor(macFromTopic);
    if (!validMac?.id) {
      console.error(`No starter found with given MAC [${topic}]`);
      return null;
    }

    if (!message.D) {
      console.error(`Invalid message data in device info ack`);
      return null;
    }

    if (message.D.version && message.D.version !== validMac.hardware_version) {
      updatedFields.hardware_version = message.D.version;
    }

    const hasValue = (value: any) => value !== undefined && value !== null &&
      typeof value === "string" && value.trim() !== "";

    // SIM recharge expiration date (validated)
    if (hasValue(message.D.val) && message.D.val !== validMac.sim_recharge_expires_at) {
      updatedFields.sim_recharge_expires_at = message.D.val;
    }

    // SIM number (validated) — strip country code, take up to 40 digits
    if (hasValue(message.D.sim_num)) {
      const rawSim = String(message.D.sim_num).replace(/^\+91/, ''); // remove +91 country code
      const simNumber = rawSim.slice(0, 40); // take up to 40 digits
      if (simNumber.length >= 1 && simNumber.length <= 40 && simNumber !== validMac.device_mobile_number) {
        updatedFields.device_mobile_number = simNumber;
      }
    }

    if (Object.keys(updatedFields).length > 0) {
      await updateRecordById<StarterBoxTable>(starterBoxes, validMac.id, updatedFields);
    }
  } catch (error: any) {
    // On error, resolve pending ACK as false so caller doesn't hang
    const pendingAck = pendingAckMap.get(macFromTopic);
    if (pendingAck) {
      pendingAck.resolve(false);
      pendingAckMap.delete(macFromTopic);
    }

    if (error?.code === "23505" || error?.cause?.code === "23505") {
      const duplicateMobile = updatedFields.device_mobile_number;
      logger.info(`Device Info ACK failed for ${macFromTopic} - Duplicate mobile number: ${duplicateMobile}`);
      logger.mqtt(`Duplicate SIM number detected during device info ACK | MAC: ${macFromTopic} | Mobile: ${duplicateMobile}`);
      return;
    }

    logger.error(`Device Info ACK error for ${macFromTopic}: ${error.message}`);
    logger.mqtt(`MQTT Device Info ACK error | MAC: ${macFromTopic} | Error: ${error.message}`);
    console.error("Error at device info ack handler:", error);
  }
}

async function handleLateScheduleAck(macOrPcb: string, message: any): Promise<void> {
  try {
    let dValue: number;
    if (typeof message.D === "number") {
      dValue = message.D;
    } else if (message.D !== null && typeof message.D === "object" && typeof message.D.ack === "number") {
      dValue = message.D.ack;
    } else {
      dValue = -1;
    }
    // Success = 1 or 2. ack=4 (flash issue) must NOT recover records to SCHEDULED.
    const ackSuccess = dValue === 1 || dValue === 2;
    if (!ackSuccess) {
      console.log(`[schedule-ack:LATE] mac=${macOrPcb} dValue=${dValue} not success — skipping recovery`);
      return;
    }

    const starter = await db.query.starterBoxes.findFirst({
      where: (s, { or: o, eq: e }) => o(e(s.mac_address, macOrPcb), e(s.pcb_number, macOrPcb)),
      columns: { id: true },
    });
    if (!starter) {
      console.log(`[schedule-ack:LATE] mac=${macOrPcb} — starter not found`);
      return;
    }

    // Partial ACK bitmask: slot IDs confirmed by device. Flat `ids` (single-motor /
    // legacy, always motor m1) plus per-motor `m1_ids` / `m2_ids` / ... (multi-motor).
    // Each motor has its own independent slot table, so bitmasks are kept separate per
    // motor reference rather than merged — a bare slot number is ambiguous otherwise.
    let confirmedSlotsByMotor: Record<string, Set<number>> | null = null;
    if (typeof message.D === "object" && message.D !== null) {
      const masks: { key: string; mask: number }[] = [];
      if (typeof message.D.ids === "number" && message.D.ids > 0) masks.push({ key: "ids", mask: message.D.ids });
      for (const [key, val] of Object.entries(message.D)) {
        if (/^m\d+_ids$/i.test(key) && typeof val === "number" && val > 0) masks.push({ key, mask: val });
      }
      if (masks.length > 0) {
        confirmedSlotsByMotor = {};
        for (const { key, mask } of masks) {
          const motorRef = key === "ids" ? "m1" : key.replace(/_ids$/i, "").toLowerCase();
          const slots = confirmedSlotsByMotor[motorRef] ??= new Set<number>();
          for (let bit = 0; bit < 16; bit++) {
            if (Number(BigInt(mask) & (1n << BigInt(bit)))) slots.add(bit + 1);
          }
        }
        const desc = Object.entries(confirmedSlotsByMotor).map(([ref, slots]) => `${ref}=[${[...slots].join(",")}]`).join(" ");
        console.log(`[schedule-ack:LATE] mac=${macOrPcb} partial bitmasks → ${desc}`);
      }
    }

    // Find PENDING records that were already dispatched (have device_schedule_id assigned)
    const pending = await db.query.motorSchedules.findMany({
      where: (ms, { and: a, eq: e, ne: n }) => a(
        e(ms.starter_id, starter.id),
        e(ms.acknowledgement, 0),
        e(ms.schedule_status, "PENDING"),
        n(ms.status, "ARCHIVED"),
        isNotNull(ms.device_schedule_id),
      ),
      columns: { id: true, device_schedule_id: true },
      with: { motor: { columns: { motor_reference: true } } },
    });

    const toUpdate = confirmedSlotsByMotor
      ? pending.filter(r => {
          if (r.device_schedule_id == null) return false;
          const motorRef = (r as any).motor?.motor_reference?.toLowerCase() ?? "m1";
          return confirmedSlotsByMotor![motorRef]?.has(r.device_schedule_id) ?? false;
        })
      : pending;

    if (toUpdate.length === 0) {
      console.log(`[schedule-ack:LATE] mac=${macOrPcb} starter=${starter.id} — no matching PENDING records to recover`);
      return;
    }

    const ids = toUpdate.map(r => r.id);
    await db.update(motorSchedules)
      .set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() })
      .where(inArray(motorSchedules.id, ids));

    console.log(`[schedule-ack:LATE_RECOVERED] mac=${macOrPcb} starter=${starter.id} set SCHEDULED for ${toUpdate.length} record(s) ids=[${ids.join(",")}]`);
    logger.info(`[schedule-ack] late ACK recovered for ${macOrPcb}: updated ${toUpdate.length} record(s) to SCHEDULED`);
  } catch (err) {
    logger.error(`[schedule-ack] late ACK recovery failed for ${macOrPcb}: ${(err as Error)?.message}`);
  }
}

async function scheduleCreationAckResolver(message: any, topic: string) {
  const macFromTopic = topic.split("/")[1];
  if (!macFromTopic) return;

  const pendingAck = pendingAckMap.get(macFromTopic);
  if (!pendingAck) {
    console.log(`[schedule-ack:LATE] mac=${macFromTopic} no pending map entry — attempting direct DB recovery. message=${JSON.stringify(message)}`);
    await handleLateScheduleAck(macFromTopic, message);
    return;
  }

  if (pendingAck.sequenceNumber !== undefined && pendingAck.sequenceNumber !== message.S) {
    logger.warn(`Schedule ACK sequence mismatch for ${macFromTopic}: expected ${pendingAck.sequenceNumber}, received ${message.S} — ignoring stale ACK`);
    // Do NOT return here without resolving: the entry would stay in the map as a zombie,
    // blocking any subsequent ACK lookup until the timeout fires. Resolve false so the
    // in-flight waitForAck times out cleanly and retries.
    pendingAck.resolve(false);
    pendingAckMap.delete(macFromTopic);
    return;
  }

  console.log(`[schedule-ack:RAW] mac=${macFromTopic} full_message=${JSON.stringify(message)}`);

  // D may be a plain number or an object like { ids: <id>, ack: <value> }
  let dValue: number;
  if (typeof message.D === "number") {
    dValue = message.D;
  } else if (message.D !== null && typeof message.D === "object" && typeof message.D.ack === "number") {
    dValue = message.D.ack;
  } else {
    dValue = -1;
  }

  // Success = 1 or 2. ack=4 is a device flash issue → NOT success, schedule stays PENDING (do NOT mark SCHEDULED).
  const ackSuccess = dValue === 1 || dValue === 2;

  console.log(`[schedule-ack:PARSED] mac=${macFromTopic} S=${message.S} D_type=${typeof message.D} dValue=${dValue} ackSuccess=${ackSuccess}`);

  // Partial ACK: a bitmask of confirmed device slots. slot n → bit (n-1) → value 2^(n-1).
  // e.g. bitmask=4 (binary 100) → bit 2 → slot 3 confirmed.
  //  - Single-motor / legacy boxes send a flat `ids` bitmask (motor m1).
  //  - Multi-motor boxes send per-motor `m1_ids` / `m2_ids` / ... bitmasks.
  // Each motor has its own independent slot table on the device, so bitmasks are kept
  // separate per motor reference rather than merged into one global slot set.
  if (ackSuccess && message.D !== null && typeof message.D === "object") {
    const bitmasks: { key: string; mask: number }[] = [];
    if (typeof message.D.ids === "number" && message.D.ids > 0) {
      bitmasks.push({ key: "ids", mask: message.D.ids });
    }
    for (const [key, val] of Object.entries(message.D)) {
      if (/^m\d+_ids$/i.test(key) && typeof val === "number" && val > 0) {
        bitmasks.push({ key, mask: val });
      }
    }

    if (bitmasks.length > 0) {
      const acknowledgedByMotor: Record<string, number[]> = {};
      for (const { key, mask } of bitmasks) {
        const motorRef = key === "ids" ? "m1" : key.replace(/_ids$/i, "").toLowerCase();
        const slots = new Set<number>();
        for (let bit = 0; bit < 16; bit++) {
          if (Number(BigInt(mask) & (1n << BigInt(bit)))) slots.add(bit + 1);
        }
        acknowledgedByMotor[motorRef] = [...slots].sort((a, b) => a - b);
      }
      schedulePartialAckMap.set(macFromTopic, acknowledgedByMotor);
      const maskDesc = bitmasks.map(b => `${b.key}=${b.mask}(0b${b.mask.toString(2)})`).join(" ");
      const idsDesc = Object.entries(acknowledgedByMotor).map(([ref, ids]) => `${ref}=[${ids.join(",")}]`).join(" ");
      console.log(`[schedule-ack:PARTIAL] mac=${macFromTopic} ${maskDesc} → ${idsDesc}`);
      logger.info(`[schedule-ack] partial ACK for ${macFromTopic}: ${maskDesc} → ${idsDesc}`);
    } else {
      console.log(`[schedule-ack:PARTIAL] mac=${macFromTopic} D is object but no positive bitmask (ids / m*_ids) → treated as full ACK`);
    }
  } else if (ackSuccess) {
    console.log(`[schedule-ack:FULL] mac=${macFromTopic} D is plain number=${dValue} → full ACK, no bitmask`);
  }

  logger.info(`[schedule-ack] ${macFromTopic} D=${dValue} success=${ackSuccess}`);
  pendingAck.resolve(ackSuccess);
  pendingAckMap.delete(macFromTopic);
  logger.info(`Schedule creation ACK resolved for ${macFromTopic}, D=${dValue}, success=${ackSuccess}`);
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
