import { logger } from "../utils/logger.js";
import { motorControlPendingAckMap } from "./ack-tracker-hepler.js";
import { buildMotorControlPayload } from "./motor-control-payload-helper.js";
import { publishData } from "../services/db/mqtt-db-services.js";
// Same retry/timeout shape as schedule sync (publishMultipleTimesInBackground in
// settings-helpers.ts) — 3 attempts, 10s ack wait each, same S reused across attempts.
const TOTAL_ATTEMPTS = 3;
const ACK_WAIT_SECONDS = [10, 10, 10];
function waitForMotorControlAck(publishedKey, sequenceNumber, timeoutMs) {
    return new Promise((resolve) => {
        let timeoutRef;
        const cleanup = () => {
            motorControlPendingAckMap.delete(publishedKey);
            clearTimeout(timeoutRef);
        };
        motorControlPendingAckMap.set(publishedKey, {
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
 * Publishes a T:1 MOTOR_CONTROL command for one or more motors on a starter box
 * and waits (with retries) for the matching T:31 ack. Resolves synchronously with
 * the final outcome — deliberately not a persisted "pending" DB status, so a
 * command can never get stuck the way unsynced schedules once did.
 */
export async function sendMotorControlCommand(starter, targets) {
    const publishedKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
    if (!publishedKey) {
        logger.error(`[motor-control] No valid publish key (mac/pcb) for starter ${starter.id}`);
        return { acked: false };
    }
    const payload = buildMotorControlPayload(targets);
    for (let attempt = 1; attempt <= TOTAL_ATTEMPTS; attempt++) {
        logger.info(`[motor-control] attempt ${attempt}/${TOTAL_ATTEMPTS} starter=${starter.id} key=${publishedKey} seq=${payload.S} D=${JSON.stringify(payload.D)}`);
        publishData(payload, starter);
        const result = await waitForMotorControlAck(publishedKey, payload.S, ACK_WAIT_SECONDS[attempt - 1] * 1000);
        if (result.acked) {
            logger.info(`[motor-control] ack received on attempt ${attempt} starter=${starter.id} seq=${payload.S}`);
            return result;
        }
        logger.warn(`[motor-control] no ack on attempt ${attempt} starter=${starter.id} key=${publishedKey} seq=${payload.S}`);
    }
    logger.error(`[motor-control] all ${TOTAL_ATTEMPTS} attempts failed for starter=${starter.id} seq=${payload.S}`);
    return { acked: false };
}
