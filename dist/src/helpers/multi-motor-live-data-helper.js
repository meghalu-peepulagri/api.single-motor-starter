import { logger } from "../utils/logger.js";
import { parseMotorKey } from "./motor-control-payload-helper.js";
// Fields that live at the GROUP level and are shared across all motors in the payload.
// Everything else required by the existing flat validator (mode, m_s, amp, flt, alt,
// l_on, l_of) is expected inside each motor's own "m<N>" block.
const GROUP_LEVEL_FIELDS = ["p_v", "pwr", "llv", "temp", "r_s"];
function isMotorBlockEntry(key, value) {
    return parseMotorKey(key) !== null && value !== null && typeof value === "object" && !Array.isArray(value);
}
/** True when the group object has at least one "m<N>" sub-object — the multi-motor shape. */
export function isMultiMotorPayload(groupData) {
    if (!groupData || typeof groupData !== "object")
        return false;
    return Object.entries(groupData).some(([key, value]) => isMotorBlockEntry(key, value));
}
/**
 * Extracts per-motor blocks from a multi-motor group payload.
 *
 * Shared group-level fields (p_v, pwr, llv, temp, r_s) are merged into every
 * motor block so each block is a self-contained flat object the existing
 * single-motor validator (validateLiveDataContent) can process unchanged.
 */
export function extractMultiMotorBlocks(groupData) {
    const sharedData = {};
    for (const field of GROUP_LEVEL_FIELDS) {
        if (groupData[field] !== undefined)
            sharedData[field] = groupData[field];
    }
    const blocks = [];
    for (const [key, value] of Object.entries(groupData)) {
        if (!isMotorBlockEntry(key, value))
            continue;
        blocks.push({ motorIndex: parseMotorKey(key), mergedData: { ...sharedData, ...value } });
    }
    return blocks;
}
/**
 * Matches extracted payload blocks to DB motors using motor_index — the same
 * m<N> <-> motor_index convention already used by the T:1/T:31 and T:2/T:32
 * control/mode ack handlers in mqtt-db-services.ts.
 *
 * matched   — blocks with a live DB motor (full pipeline: insert + motor state/mode updates).
 * unmatched — blocks with no motor currently assigned to that slot (parameters-only insert, no motor updates).
 */
export function resolveMotorsFromPayload(blocks, dbMotors) {
    const motorByIndex = new Map(dbMotors.map(m => [m.motor_index ?? 1, m]));
    const matched = [];
    const unmatched = [];
    for (const { motorIndex, mergedData } of blocks) {
        const motor = motorByIndex.get(motorIndex);
        if (!motor) {
            logger.warn(`[multi-motor] No DB motor at motor_index=${motorIndex} — will attempt parameters-only insert`);
            unmatched.push({ motorIndex, mergedData });
            continue;
        }
        matched.push({ motorIndex, motor, mergedData });
    }
    return { matched, unmatched };
}
