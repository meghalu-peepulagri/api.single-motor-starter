import { controlMode, getAlertDescription, getFaultDescription, lastOff, lastOn, motorState } from "./control-helpers.js";
import { parseTimestamp } from "./dns-helpers.js";
import { logger } from "../utils/logger.js";
import { cleanScalar, cleanThreeNumberArray } from "./payload-validate-helpers.js";
export function prepareLiveDataPayload(validatedData, starterData) {
    if (!validatedData || !starterData || !starterData.motors || starterData.motors.length === 0) {
        logger.error("Invalid validatedData or starterData found with no motors attached", undefined, { mac: starterData?.mac_address });
        return null;
    }
    ;
    const data = validatedData.data;
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
        // Timestamp
        time_stamp: parseTimestamp(validatedData.ct),
        payload_valid: validatedData.validated_payload,
        payload_errors: validatedData.errors,
        starter_id: starterData.id || null,
        gateway_id: starterData.gateway_id || null,
        user_id: starterData.created_by || null,
        motor_id: starterData.motors[0].id || null,
    };
}
