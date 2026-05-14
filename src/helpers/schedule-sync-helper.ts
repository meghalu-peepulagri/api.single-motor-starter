import { inArray } from "drizzle-orm";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import type { StarterBox } from "../database/schemas/starter-boxes.js";

type StarterForPublish = Pick<StarterBox, "id" | "mac_address" | "pcb_number" | "device_allocation">;
import { logger } from "../utils/logger.js";
import { findPendingSchedulesForStarter } from "../services/db/motor-schedules-services.js";
import { buildDeviceSyncPayloads } from "./motor-schedule-payload-helper.js";
import { publishMultipleTimesInBackground } from "./settings-helpers.js";
import { publishingMap } from "./ack-tracker-hepler.js";

/**
 * Settings publishes (T:4) and our schedule publish (T:3) share the same
 * publishingMap lock keyed by starter id. If T:4 is in flight when we fire,
 * publishMultipleTimesInBackground would return false immediately. Poll the
 * lock briefly so we can publish once it clears, instead of dropping the chunk.
 */
async function waitForPublishLock(starterId: number, maxWaitMs = 30000, intervalMs = 500): Promise<boolean> {
  const start = Date.now();
  while (publishingMap.get(starterId)) {
    if (Date.now() - start > maxWaitMs) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return true;
}

/**
 * Push all unacknowledged motor schedules for ONE starter via MQTT.
 * Returns counts for observability. Safe to call fire-and-forget — errors are caught
 * and logged so MQTT message handlers never crash because of a sync failure.
 *
 * Called from the heartbeat handler when a device transitions to online.
 */
export async function pushPendingSchedulesForStarter(
  starter: StarterForPublish,
  motorId?: number,
): Promise<{ chunks: number; acked: number }> {
  let chunksSent = 0;
  let acked = 0;

  try {
    const records = await findPendingSchedulesForStarter(starter.id, motorId);
    if (!records || records.length === 0) return { chunks: 0, acked: 0 };

    const grouped = buildDeviceSyncPayloads(records);
    for (const { chunks } of grouped) {
      for (const { payload, dbIds } of chunks) {
        chunksSent++;

        // Settings publish (T:4) may have grabbed publishingMap; wait it out.
        const lockFree = await waitForPublishLock(starter.id);
        if (!lockFree) {
          logger.warn(`[schedule-sync] publish lock still held after wait for starter=${starter.id}; will retry next heartbeat`);
          continue;
        }

        const ok = await publishMultipleTimesInBackground(payload, starter as StarterBox);
        if (ok) {
          acked++;
          await db
            .update(motorSchedules)
            .set({
              schedule_status: "SCHEDULED",
              acknowledgement: 1,
              acknowledged_at: new Date(),
              updated_at: new Date(),
            })
            .where(inArray(motorSchedules.id, dbIds));
        }
      }
    }

    if (chunksSent > 0) {
      logger.info(
        `[schedule-sync] starter=${starter.id} chunks=${chunksSent} acked=${acked}`,
      );
    }
  } catch (err) {
    logger.error(
      `[schedule-sync] failed for starter=${starter.id}: ${(err as Error)?.message}`,
    );
  }

  return { chunks: chunksSent, acked };
}
