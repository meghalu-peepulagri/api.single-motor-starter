import { logger } from "../utils/logger.js";
import { controlMode, getAlertDescription, getFailureReason, getFaultDescription, lastOff, lastOn, motorState } from "./control-helpers.js";
import { parseTimestamp } from "./dns-helpers.js";
import { normalizeTime } from "./motor-schedule-payload-helper.js";
import { cleanScalar, cleanThreeNumberArray } from "./payload-validate-helpers.js";
import type { preparedLiveData } from "../types/app-types.js";
import type { NewStarterBoxParameters } from "../database/schemas/starter-parameters.js";

export function prepareLiveDataPayload(validatedData: any, starterData: any) {

  if (!validatedData || !starterData || !starterData.motors || starterData.motors.length === 0) {
    logger.error("Invalid validatedData or starterData found with no motors attached", undefined, { mac: starterData?.mac_address });
    console.error("Invalid validatedData or starterData found with no motors attached", undefined, { mac: starterData?.mac_address });
    return null;
  };


  const data = validatedData.data;

  const sch = data.sch && typeof data.sch === "object" && Object.keys(data.sch).length > 0 ? data.sch : null;
  const schStartTime = sch ? (normalizeTime(sch.st) ?? null) : null;
  const schRuntime = sch ? (sch.rt ?? null) : null;
  const schEndTime = sch?.et ? (normalizeTime(sch.et) ?? null) : null;

  const llvSource = data.llv || data.ll_v || [];
  const llv = cleanThreeNumberArray(llvSource);
  const amp = cleanThreeNumberArray(data.amp || []);
  const motorStateValue = cleanScalar(data.m_s ?? data.mtr_sts) || 0;


  return {

    payload_version: cleanScalar(data.p_v) || 0,
    packet_number: validatedData.T,

    // Line voltages
    line_voltage_r: llv[0],
    line_voltage_y: llv[1],
    line_voltage_b: llv[2],
    avg_voltage: Math.round(((llv[0] + llv[1] + llv[2]) / 3) * 100) / 100,

    // Currents
    current_r: amp[0],
    current_y: amp[1],
    current_b: amp[2],
    avg_current: Math.round(((amp[0] + amp[1] + amp[2]) / 3) * 100) / 100,

    // Power & motor
    power_present: cleanScalar(data.pwr) || 0,
    motor_mode: cleanScalar(data.mode) || 0,
    motor_state: cleanScalar(motorStateValue) || 0,
    mode_description: controlMode(data.mode) || "Unknown",
    motor_description: motorState(motorStateValue) || "Unknown",

    // Faults & alerts
    alert_code: cleanScalar(data.alt) || 0,
    alert_description: getAlertDescription(data.alt) || "Unknown alert",
    fault: cleanScalar(data.flt) || 0,
    fault_description: getFaultDescription(data.flt) || "Unknown fault",

    last_on_code: cleanScalar(data.l_on) || 0,
    last_on_description: lastOn(data.l_on) || "Unknown",
    last_off_code: cleanScalar(data.l_of) || 0,
    last_off_description: lastOff(data.l_of) || "Unknown",
    group_id: validatedData.group || null,
    temp: cleanScalar(data.temp) || 0,

    // Timestamp
    time_stamp: parseTimestamp(validatedData.ct),
    payload_valid: validatedData.validated_payload,
    payload_errors: validatedData.errors,
    starter_id: starterData.id || null,
    gateway_id: starterData.gateway_id || null,
    user_id: starterData.created_by || null,
    motor_id: starterData.motors[0].id || null,

    // Schedule
    active_schedule_id: sch?.id ?? null,
    active_schedule_type: null,
    active_schedule_start_time: schStartTime,
    active_schedule_runtime_minutes: schRuntime,
    active_schedule_end_time: schEndTime,
    active_schedule_missed_minutes: sch?.mm ?? 0,
    active_schedule_failure_at: sch?.fe ? new Date(String(sch.fe).length === 13 ? Number(sch.fe) : Number(sch.fe) * 1000) : null,
    active_schedule_failure_reason: getFailureReason(cleanScalar(sch?.fr)),
  };
}

export function prepareStarterParametersRecord(insertedData: preparedLiveData): NewStarterBoxParameters {
  return {
    payload_version: String(insertedData.payload_version),
    packet_number: insertedData.packet_number,
    line_voltage_r: insertedData.line_voltage_r,
    line_voltage_y: insertedData.line_voltage_y,
    line_voltage_b: insertedData.line_voltage_b,
    avg_voltage: insertedData.avg_voltage,
    current_r: insertedData.current_r,
    current_y: insertedData.current_y,
    current_b: insertedData.current_b,
    avg_current: insertedData.avg_current,
    power_present: insertedData.power_present,
    motor_mode: insertedData.motor_mode,
    mode_description: insertedData.mode_description,
    motor_state: insertedData.motor_state,
    motor_description: insertedData.motor_description,
    alert_code: insertedData.alert_code,
    alert_description: insertedData.alert_description,
    fault: insertedData.fault,
    fault_description: insertedData.fault_description,
    last_on_code: insertedData.last_on_code,
    last_on_description: insertedData.last_on_description,
    last_off_code: insertedData.last_off_code,
    last_off_description: insertedData.last_off_description,
    time_stamp: insertedData.time_stamp,
    starter_id: insertedData.starter_id,
    motor_id: insertedData.motor_id,
    gateway_id: insertedData.gateway_id,
    user_id: insertedData.user_id,
    payload_valid: insertedData.payload_valid,
    payload_errors: insertedData.payload_errors,
    group_id: String(insertedData.group_id),
    temperature: insertedData.temp,
    schedule_id: insertedData.active_schedule_id,
    schedule_start_time: insertedData.active_schedule_start_time,
    schedule_end_time: insertedData.active_schedule_end_time,
    schedule_runtime_minutes: insertedData.active_schedule_runtime_minutes,
    schedule_type: insertedData.active_schedule_type,
    schedule_missed_minutes: insertedData.active_schedule_missed_minutes,
    schedule_failure_at: insertedData.active_schedule_failure_at,
    schedule_failure_reason: insertedData.active_schedule_failure_reason,
  };
}
