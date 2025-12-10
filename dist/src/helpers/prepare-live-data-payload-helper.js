import { controlMode, getAlertDescription, getFaultDescription, lastOff, lastOn, motorState } from "./control-helpers.js";
import { parseTimestamp } from "./dns-helpers.js";
import { cleanScalar, cleanThreeNumberArray } from "./payload-validate-helpers.js";
export function prepareLiveDataPayload(validatedData, starterData) {
    if (!validatedData || !validatedData.data)
        return null;
    const data = validatedData.data;
    // Clean arrays (llv, amp) and scalars
    const llv = cleanThreeNumberArray(data.llv || []);
    const amp = cleanThreeNumberArray(data.amp || []);
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
        motor_state: cleanScalar(data.m_s) || 0,
        mode_description: controlMode(data.mode) || "Unknown",
        motor_description: motorState(data.m_s) || "Unknown",
        // Faults & alerts
        alert_code: cleanScalar(data.alert_code) || 0,
        alert_description: getAlertDescription(data.alert_code) || "Unknown",
        fault: cleanScalar(data.fault) || 0,
        fault_description: getFaultDescription(data.fault) || "Unknown",
        last_on_code: cleanScalar(data.l_on) || 0,
        last_on_description: lastOn(data.l_on) || "Unknown",
        last_off_code: cleanScalar(data.l_of) || 0,
        last_off_description: lastOff(data.l_of) || "Unknown",
        group_id: validatedData.group || null,
        // Timestamp
        time_stamp: parseTimestamp(data.ct),
        payload_valid: validatedData.validated_payload,
        payload_errors: validatedData.errors,
        starter_id: starterData.id || null,
        gateway_id: starterData.gateway_id || null,
        user_id: starterData.created_by || null,
        motor_id: starterData.motors[0].id || null,
    };
}
