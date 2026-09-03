import type { StarterBox } from "../database/schemas/starter-boxes.js";
import { logger } from "../utils/logger.js";
import { modeControlPendingAckMap, type DeviceCommandAckResult } from "./ack-tracker-hepler.js";
import { buildModeControlPayload, type ModeControlTarget } from "./mode-control-payload-helper.js";
import { publishData } from "../services/db/mqtt-db-services.js";

// Same retry/timeout shape as motor state control (motor-control-sync-helper.ts) —
// 3 attempts, 10s ack wait each, same S reused across attempts.
const TOTAL_ATTEMPTS = 3;
const ACK_WAIT_SECONDS = [10, 10, 10];

function waitForModeControlAck(publishedKey: string, sequenceNumber: number, timeoutMs: number): Promise<DeviceCommandAckResult> {
  return new Promise((resolve) => {
    let timeoutRef: NodeJS.Timeout;

    const cleanup = () => {
      modeControlPendingAckMap.delete(publishedKey);
      clearTimeout(timeoutRef);
    };

    modeControlPendingAckMap.set(publishedKey, {
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
 * Publishes a T:2 MODE_CHANGE command for one or more motors on a starter box and
 * waits (with retries) for the matching T:32 ack. Resolves synchronously with the
 * final outcome — no persisted "pending" DB status, same design as motor control.
 */
export async function sendModeControlCommand(
  starter: StarterBox,
  targets: ModeControlTarget[],
): Promise<DeviceCommandAckResult> {
  const publishedKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
  if (!publishedKey) {
    logger.error(`[mode-control] No valid publish key (mac/pcb) for starter ${starter.id}`);
    return { acked: false };
  }

  const payload = buildModeControlPayload(targets);

  for (let attempt = 1; attempt <= TOTAL_ATTEMPTS; attempt++) {
    logger.info(`[mode-control] attempt ${attempt}/${TOTAL_ATTEMPTS} starter=${starter.id} key=${publishedKey} seq=${payload.S} D=${JSON.stringify(payload.D)}`);
    publishData(payload, starter);

    const result = await waitForModeControlAck(publishedKey, payload.S, ACK_WAIT_SECONDS[attempt - 1] * 1000);
    if (result.acked) {
      logger.info(`[mode-control] ack received on attempt ${attempt} starter=${starter.id} seq=${payload.S}`);
      return result;
    }

    logger.warn(`[mode-control] no ack on attempt ${attempt} starter=${starter.id} key=${publishedKey} seq=${payload.S}`);
  }

  logger.error(`[mode-control] all ${TOTAL_ATTEMPTS} attempts failed for starter=${starter.id} seq=${payload.S}`);
  return { acked: false };
}
