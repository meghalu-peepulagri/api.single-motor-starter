import { logger } from "../utils/logger.js";
import { settingsControlPendingAckMap } from "./ack-tracker-hepler.js";
import { buildMultiMotorSettingsPayload } from "./multi-motor-settings-payload-helper.js";
import { publishData } from "../services/db/mqtt-db-services.js";
// Same retry/timeout shape as motor control/mode sync (motor-control-sync-helper.ts,
// mode-control-sync-helper.ts) — 3 attempts, 10s ack wait each.
const TOTAL_ATTEMPTS = 3;
const ACK_WAIT_SECONDS = [10, 10, 10];
function waitForSettingsControlAck(publishedKey, sequenceNumber, timeoutMs) {
    return new Promise((resolve) => {
        let timeoutRef;
        const cleanup = () => {
            settingsControlPendingAckMap.delete(publishedKey);
            clearTimeout(timeoutRef);
        };
        settingsControlPendingAckMap.set(publishedKey, {
            sequenceNumber,
            resolve: (result) => {
                cleanup();
                resolve(result);
            },
        });
        timeoutRef = setTimeout(() => {
            cleanup();
            resolve({ acked: false });
        }, timeoutMs);
    });
}
/**
 * Publishes a T:4 multi-motor settings/calibration command for a MULTI_STARTER box
 * and waits (with retries) for the matching per-motor T:34 ack. Mirrors
 * sendMotorControlCommand (motor-control-sync-helper.ts) exactly — same retry shape,
 * just resolved via settingsControlPendingAckMap instead of motorControlPendingAckMap
 * so it can never be resolved by (or resolve) an unrelated control/mode ack.
 *
 * The SINGLE_STARTER settings publish path (publishMultipleTimesInBackground in
 * settings-helpers.ts, resolved via the generic pendingAckMap) is untouched — this
 * function is only ever called for MULTI_STARTER boxes.
 */
export async function sendMultiMotorSettingsCommand(starter, settings, motorIndexByMotorId) {
    const publishedKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
    if (!publishedKey) {
        logger.error(`[multi-motor-settings] No valid publish key (mac/pcb) for starter ${starter.id}`);
        return { acked: false };
    }
    const payload = buildMultiMotorSettingsPayload(settings, motorIndexByMotorId);
    for (let attempt = 1; attempt <= TOTAL_ATTEMPTS; attempt++) {
        logger.info(`[multi-motor-settings] attempt ${attempt}/${TOTAL_ATTEMPTS} starter=${starter.id} key=${publishedKey} seq=${payload.S}`);
        publishData(payload, starter);
        const result = await waitForSettingsControlAck(publishedKey, payload.S, ACK_WAIT_SECONDS[attempt - 1] * 1000);
        if (result.acked) {
            logger.info(`[multi-motor-settings] ack received on attempt ${attempt} starter=${starter.id} seq=${payload.S}`);
            return result;
        }
        logger.warn(`[multi-motor-settings] no ack on attempt ${attempt} starter=${starter.id} key=${publishedKey} seq=${payload.S}`);
    }
    logger.error(`[multi-motor-settings] all ${TOTAL_ATTEMPTS} attempts failed for starter=${starter.id} seq=${payload.S}`);
    return { acked: false };
}
