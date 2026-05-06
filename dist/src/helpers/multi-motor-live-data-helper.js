import { logger } from "../utils/logger.js";
// Fields that live at the GROUP level and are shared across all motors in the payload
const GROUP_LEVEL_FIELDS = ["p_v", "pwr", "llv", "temp"];
// Valid motor reference keys inside a multi-motor group
const MOTOR_REF_KEYS = ["m1", "m2"];
/**
 * Returns true when the group object contains at least one motor-reference key (m1 / m2).
 * Used to distinguish MULTI_STARTER payload format from SINGLE_STARTER.
 */
export function isMultiMotorPayload(groupData) {
    if (!groupData || typeof groupData !== "object")
        return false;
    return MOTOR_REF_KEYS.some(ref => ref in groupData);
}
/**
 * Extracts per-motor blocks from a MULTI_STARTER group payload.
 *
 * Shared group-level fields (p_v, pwr, llv) are merged into every motor block
 * so that each block is a self-contained flat object the existing validator
 * can process without any changes.
 */
export function extractMultiMotorBlocks(groupData) {
    const sharedData = {};
    for (const field of GROUP_LEVEL_FIELDS) {
        if (groupData[field] !== undefined)
            sharedData[field] = groupData[field];
    }
    const blocks = [];
    for (const ref of MOTOR_REF_KEYS) {
        const block = groupData[ref];
        if (!block || typeof block !== "object")
            continue;
        blocks.push({
            motorRef: ref,
            mergedData: { ...sharedData, ...block },
        });
    }
    return blocks;
}
/**
 * Matches extracted payload blocks to DB motors using motor_reference.
 *
 * Case 1 — Block key (m1/m2) has no matching DB motor with that motor_reference:
 *   → Log warning and skip.
 *
 * Case 2 — No blocks could be matched at all:
 *   Returns an empty array. Caller is responsible for logging and early return.
 */
export function resolveMotorsFromPayload(blocks, dbMotors) {
    const motorByRef = new Map(dbMotors
        .filter(m => m.motor_reference !== null)
        .map(m => [m.motor_reference, m]));
    const resolved = [];
    for (const { motorRef, mergedData } of blocks) {
        const motor = motorByRef.get(motorRef);
        if (!motor) {
            logger.warn(`[MULTI_STARTER] No DB motor with motor_reference="${motorRef}" — skipping block`);
            continue;
        }
        resolved.push({ motorRef, motor, mergedData });
    }
    return resolved;
}
