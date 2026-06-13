import { and, eq, gte, inArray, isNull, lte, ne, notInArray } from "drizzle-orm";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { starterBoxes, type StarterBox } from "../database/schemas/starter-boxes.js";

type StarterForPublish = Pick<StarterBox, "id" | "mac_address" | "pcb_number" | "device_allocation">;
import { logger } from "../utils/logger.js";
import { findAndDeleteExpiredSchedules, findPendingSchedulesForStarter } from "../services/db/motor-schedules-services.js";
import { buildDeviceSyncPayloads, dateToYYMMDD, todayAsYYMMDD } from "./motor-schedule-payload-helper.js";
import { publishMultipleTimesInBackground } from "./settings-helpers.js";
import { publishingMap, schedulePartialAckMap } from "./ack-tracker-hepler.js";

async function waitForPublishLock(starterId: number, maxWaitMs = 30000, intervalMs = 500): Promise<boolean> {
  const start = Date.now();
  while (publishingMap.get(starterId)) {
    if (Date.now() - start > maxWaitMs) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return true;
}

const MAX_DEVICE_SLOTS = 15;

/**
 * Push all unacknowledged PENDING schedules for ONE starter via MQTT.
 * Slots 1–15 are assigned only to records that don't already have one.
 * Slots occupied by ack=1 (already on device) records are never reused,
 * so currently running/scheduled schedules are never overwritten.
 */
export async function pushPendingSchedulesForStarter(
  starter: StarterForPublish,
  motorId?: number,
): Promise<{ chunks: number; acked: number }> {
  if (publishingMap.get(starter.id)) {
    logger.info(`[schedule-sync] publish already in progress for starter=${starter.id}, skipping`);
    return { chunks: 0, acked: 0 };
  }

  let chunksSent = 0;
  let acked = 0;

  try {
    // Step 1 — Delete expired schedules (end_date < today), freeing their device slots.
    const freedSlots = await findAndDeleteExpiredSchedules(starter.id, motorId);
    if (freedSlots.length > 0) {
      logger.info(`[schedule-sync] starter=${starter.id} cleared ${freedSlots.length} expired schedule(s), freed slots=[${freedSlots.join(",")}]`);
    }

    // Step 2 — Fetch PENDING records within today → today+2 window.
    const twoDaysLater = new Date();
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    const windowEnd = dateToYYMMDD(twoDaysLater);

    const allRecords = await findPendingSchedulesForStarter(starter.id, motorId);
    const records = allRecords?.filter(r => r.schedule_start_date != null && r.schedule_start_date <= windowEnd) ?? [];
    if (records.length === 0) return { chunks: 0, acked: 0 };

    // Step 3 — Assign free slots (1–15) to records that don't have one yet.
    // Slots already held by OTHER active (ack=1) records are off-limits so we
    // never overwrite a schedule that's currently running on the device.
    const incomingDbIds = records.map(r => r.id);

    const takenRows = await db
      .select({ device_schedule_id: motorSchedules.device_schedule_id })
      .from(motorSchedules)
      .where(and(
        eq(motorSchedules.starter_id, starter.id),
        ne(motorSchedules.status, "ARCHIVED"),
        notInArray(motorSchedules.schedule_status, ["DELETED", "FAILED"]),
        notInArray(motorSchedules.id, incomingDbIds),
      ));

    const takenSlots = new Set<number>(
      takenRows.map(r => r.device_schedule_id).filter((id): id is number => id != null),
    );

    // Pre-claim slots already assigned to incoming records (from a prior failed attempt).
    for (const r of records) {
      if (r.device_schedule_id != null) takenSlots.add(r.device_schedule_id);
    }

    // Assign free slots to unassigned records.
    for (const r of records) {
      if (r.device_schedule_id != null) continue;
      let assigned: number | null = null;
      for (let slot = 1; slot <= MAX_DEVICE_SLOTS; slot++) {
        if (!takenSlots.has(slot)) { takenSlots.add(slot); assigned = slot; break; }
      }
      if (assigned == null) {
        logger.warn(`[schedule-sync] starter=${starter.id} no free slots — schedule id=${r.id} skipped`);
        continue;
      }
      (r as any).device_schedule_id = assigned;
      await db.update(motorSchedules)
        .set({ device_schedule_id: assigned })
        .where(and(eq(motorSchedules.id, r.id), isNull(motorSchedules.device_schedule_id)))
        .catch(() => null);
    }

    // Drop records that couldn't get a slot.
    const assignedRecords = records.filter(r => (r as any).device_schedule_id != null);
    if (assignedRecords.length === 0) return { chunks: 0, acked: 0 };

    logger.info(`[schedule-sync] starter=${starter.id} slots=[${assignedRecords.map(r => (r as any).device_schedule_id).join(",")}]`);

    const publishKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;

    const grouped = buildDeviceSyncPayloads(assignedRecords);
    for (const { chunks } of grouped) {
      for (const { payload, dbIds, scheduleIds } of chunks) {
        chunksSent++;

        const lockFree = await waitForPublishLock(starter.id);
        if (!lockFree) {
          logger.warn(`[schedule-sync] publish lock still held after wait for starter=${starter.id}; will retry next heartbeat`);
          continue;
        }

        const stillPending = await db.query.motorSchedules.findMany({
          where: (ms, { and, inArray: inArr, eq: e }) => and(inArr(ms.id, dbIds), e(ms.acknowledgement, 0)),
          columns: { id: true, schedule_id: true },
        });

        if (stillPending.length === 0) {
          logger.info(`[schedule-sync] starter=${starter.id} chunk already acknowledged, skipping`);
          continue;
        }

        const ok = await publishMultipleTimesInBackground(payload, starter as StarterBox);
        if (ok) {
          acked++;

          const partialIds = publishKey ? schedulePartialAckMap.get(publishKey) : undefined;
          if (publishKey) schedulePartialAckMap.delete(publishKey);

          let idsToUpdate: number[];
          if (partialIds && partialIds.length > 0) {
            const confirmedSet = new Set(partialIds);
            idsToUpdate = stillPending
              .filter((r) => confirmedSet.has(r.schedule_id))
              .map((r) => r.id);
            const unmatched = scheduleIds.filter((sid) => !confirmedSet.has(sid));
            if (unmatched.length > 0) {
              logger.warn(`[schedule-sync] starter=${starter.id} partial ACK: confirmed=[${partialIds.join(",")}] unmatched=[${unmatched.join(",")}] — unmatched stay PENDING`);
            }
          } else {
            idsToUpdate = stillPending.map((r) => r.id);
          }

          if (idsToUpdate.length > 0) {
            await db
              .update(motorSchedules)
              .set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() })
              .where(inArray(motorSchedules.id, idsToUpdate));
            logger.info(`[schedule-sync] starter=${starter.id} updated ${idsToUpdate.length}/${stillPending.length} schedule(s) to SCHEDULED`);
          }
        } else {
          logger.warn(`[schedule-sync] starter=${starter.id} publish failed or no ACK, will retry next heartbeat`);
          if (publishKey) schedulePartialAckMap.delete(publishKey);
        }
      }
    }

    if (chunksSent > 0) {
      logger.info(`[schedule-sync] starter=${starter.id} chunks=${chunksSent} acked=${acked}`);
    }
  } catch (err) {
    logger.error(`[schedule-sync] failed for starter=${starter.id}: ${(err as Error)?.message}`);
  }

  return { chunks: chunksSent, acked };
}

/**
 * Query all starters that have PENDING schedules within the 3-day window
 * and push them. Called by the 22:00 and 00:15 cron endpoints.
 */
export async function runScheduleSync(label = "cron"): Promise<{ starters: number; skipped: number }> {
  const today = todayAsYYMMDD();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(twoDaysLater.getDate() + 2);
  const windowEnd = dateToYYMMDD(twoDaysLater);

  const rows = await db
    .selectDistinct({ starter_id: motorSchedules.starter_id })
    .from(motorSchedules)
    .where(and(
      eq(motorSchedules.acknowledgement, 0),
      eq(motorSchedules.schedule_status, "PENDING"),
      ne(motorSchedules.status, "ARCHIVED"),
      gte(motorSchedules.schedule_start_date, today),
      lte(motorSchedules.schedule_start_date, windowEnd),
    ));

  const starterIds = rows.map(r => r.starter_id).filter((id): id is number => id != null);
  if (starterIds.length === 0) {
    logger.info(`[${label}] no starters with pending schedules in window`);
    return { starters: 0, skipped: 0 };
  }

  const starters = await db.query.starterBoxes.findMany({
    where: (s, { and: a, inArray: inArr, ne: n }) => a(inArr(s.id, starterIds), n(s.status, "ARCHIVED")),
    columns: { id: true, mac_address: true, pcb_number: true, device_allocation: true, signal_quality: true },
  });

  const online = starters.filter(s => s.signal_quality != null && s.signal_quality >= 1 && s.signal_quality <= 30);
  const skipped = starters.length - online.length;

  logger.info(`[${label}] starters=${starters.length} online=${online.length} skipped_offline=${skipped}`);

  await Promise.allSettled(
    online.map(s =>
      pushPendingSchedulesForStarter(s as any).catch(err =>
        logger.error(`[${label}] starter=${s.id} failed: ${(err as Error)?.message}`)
      )
    )
  );

  return { starters: online.length, skipped };
}
