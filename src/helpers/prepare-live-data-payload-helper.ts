import { parseTimestamp } from "./dns-helper.js";
import { cleanScalar, cleanThreeNumberArray } from "./payload-validate-helpers.js";

export function prepareLiveDataPayload(validatedData: any) {
  if (!validatedData || !validatedData.data) return null;

  const data = validatedData.data;

  // Clean arrays (llv, amp) and scalars
  const llv = cleanThreeNumberArray(data.llv || []);
  const amp = cleanThreeNumberArray(data.amp || []);

  return {

    payload_version: cleanScalar(data.p_v) || 0,

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
    motor_state: cleanScalar(data.m_s) || 0,
    mode_description: data.mode_description || "",
    motor_description: data.motor_description || "",

    // Faults & alerts
    alert_code: cleanScalar(data.l_of) || 0,
    alert_description: data.alert_description || "",
    fault: cleanScalar(data.flt) || 0,
    fault_description: data.fault_description || "",

    last_on_code: cleanScalar(data.l_on) || 0,
    last_on_description: data.last_on_description || "",
    last_off_code: cleanScalar(data.l_of) || 0,
    last_off_description: data.last_off_description || "",

    // Timestamp
    time_stamp: parseTimestamp(data.ct),
    valid_data: validatedData.validated_payload,

    starter_id: data.starter_id || null,
    mac_address: data.mac_address || null,
    gateway_id: data.gateway_id || null,
    user_id: data.user_id || null,

  };
}
