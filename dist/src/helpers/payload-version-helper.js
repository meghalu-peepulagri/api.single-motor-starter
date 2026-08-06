/**
 * Single source of truth for "which payload grammar does this board speak".
 *
 * Every publish path resolves the version through payloadVersionOf() rather than
 * inferring it from starter_type, motor count, or the presence of
 * multi_motor_config — those correlate today and stop correlating the moment a
 * single-motor board ships with V2.0 firmware, which is exactly the case this
 * column exists to express.
 *
 *   1.0 — legacy format, no m1/m2 blocks. Single motor only. FROZEN: nothing in
 *         this project may change what a 1.0 box receives.
 *   2.0 — per-motor blocks: m1 for a single-motor box, m1 + m2 for a dual one.
 */
/** Anything unrecognised resolves to "1.0" — the safe direction for an unknown board. */
export function payloadVersionOf(starter) {
    return starter?.payload_version === "2.0" ? "2.0" : "1.0";
}
export function isV2Payload(starter) {
    return payloadVersionOf(starter) === "2.0";
}
/**
 * Motor count for payload purposes. motor_support_type is the authority — it is what
 * motor control and schedule sync already read, and it maps to the Admin Panel's
 * single/dual choice. starter_type is checked only as a fallback because the two can
 * disagree: prepareStarterData lets a caller override starter_type but not
 * motor_support_type.
 */
export function isDualMotor(starter) {
    return starter?.motor_support_type === "MULTIPLE_MOTORS" || starter?.starter_type === "MULTI_STARTER";
}
/**
 * "1.0 + dual" has no defined payload shape — a 1.0 payload has nowhere to put m2, so
 * publishing one would silently drop a motor. Callers use this to reject the pair at
 * the API boundary and to detect it at publish time.
 */
export function isInvalidVersionMotorPair(version, dualMotor) {
    return version === "1.0" && dualMotor;
}
