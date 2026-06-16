import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
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

/**
 * Push all unacknowledged PENDING schedules for ONE starter via MQTT.
 * device_schedule_id is assigned only to records that don't already have one,
 * using an ever-increasing counter (last_device_schedule_id on starter_boxes).
 */
export async function pushPendingSchedulesForStarter(
  starter: StarterForPublish,
  motorId?: number,
  filterIds?: number[],
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
    const records = (allRecords ?? [])
      .filter(r => r.schedule_start_date != null && r.schedule_start_date <= windowEnd)
      .filter(r => filterIds == null || filterIds.includes(r.id));
    if (records.length === 0) return { chunks: 0, acked: 0 };

    // Step 3 — Assign device_schedule_id to records that don't have one yet,
    // using an ever-increasing counter per starter (never reuses freed IDs).
    const unassigned = records.filter(r => r.device_schedule_id == null);
    if (unassigned.length > 0) {
      await db.transaction(async (trx) => {
        const [starterRow] = await trx
          .select({ last: starterBoxes.last_device_schedule_id })
          .from(starterBoxes)
          .where(eq(starterBoxes.id, starter.id))
          .for("update");

        let counter = starterRow?.last ?? 0;
        for (const r of unassigned) {
          counter++;
          (r as any).device_schedule_id = counter;
          await trx
            .update(motorSchedules)
            .set({ device_schedule_id: counter })
            .where(and(eq(motorSchedules.id, r.id), isNull(motorSchedules.device_schedule_id)));
        }
        await trx
          .update(starterBoxes)
          .set({ last_device_schedule_id: counter })
          .where(eq(starterBoxes.id, starter.id));
      }).catch(err => logger.warn(`[schedule-sync] device_schedule_id assignment failed: ${err?.message}`));
    }

    const assignedRecords = records.filter(r => (r as any).device_schedule_id != null);
    if (assignedRecords.length === 0) return { chunks: 0, acked: 0 };

    logger.info(`[schedule-sync] starter=${starter.id} slots=[${assignedRecords.map(r => (r as any).device_schedule_id).join(",")}]`);

    const publishKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;

    const ackedRow = await db.query.motorSchedules.findFirst({
      where: (ms, { and: a, eq: e, ne: n }) => a(e(ms.starter_id, starter.id), e(ms.acknowledgement, 1), n(ms.status, "ARCHIVED")),
      columns: { id: true },
    });
    const isFirstSync = !ackedRow;
    const firstSyncStarterIds = isFirstSync ? new Set([starter.id]) : new Set<number>()
    const grouped = buildDeviceSyncPayloads(assignedRecords, firstSyncStarterIds);
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
          columns: { id: true, schedule_id: true, device_schedule_id: true },
        });

        if (stillPending.length === 0) {
          logger.info(`[schedule-sync] starter=${starter.id} chunk already acknowledged, skipping`);
          continue;
        }

        console.log(`[schedule-sync:SEND] starter=${starter.id} key=${publishKey} dbIds=[${dbIds.join(",")}] scheduleIds(slot)=[${scheduleIds.join(",")}] payload=${JSON.stringify(payload)}`);

        const ok = await publishMultipleTimesInBackground(payload, starter as StarterBox);

        console.log(`[schedule-sync:ACK_RESULT] starter=${starter.id} ok=${ok} schedulePartialAckMap_key=${publishKey} partialAckRaw=${JSON.stringify(publishKey ? schedulePartialAckMap.get(publishKey) : null)}`);

        if (ok) {
          acked++;

          const partialIds = publishKey ? schedulePartialAckMap.get(publishKey) : undefined;
          if (publishKey) schedulePartialAckMap.delete(publishKey);

          console.log(`[schedule-sync:PARTIAL_IDS] starter=${starter.id} partialIds=${JSON.stringify(partialIds)} stillPending=${JSON.stringify(stillPending)}`);

          let idsToUpdate: number[];
          if (partialIds && partialIds.length > 0) {
            const confirmedSet = new Set(partialIds);
            // device_schedule_id is the slot (1–15) sent in payload `id` field — matches the bitmask
            idsToUpdate = stillPending
              .filter((r) => confirmedSet.has(r.device_schedule_id ?? r.schedule_id))
              .map((r) => r.id);
            const unmatched = scheduleIds.filter((sid) => !confirmedSet.has(sid));
            console.log(`[schedule-sync:PARTIAL_MATCH] confirmedSet=[${[...confirmedSet].join(",")}] stillPending_slots=[${stillPending.map(r => r.device_schedule_id ?? r.schedule_id).join(",")}] idsToUpdate=[${idsToUpdate.join(",")}] unmatched=[${unmatched.join(",")}]`);
            if (unmatched.length > 0) {
              logger.warn(`[schedule-sync] starter=${starter.id} partial ACK: confirmed=[${partialIds.join(",")}] unmatched=[${unmatched.join(",")}] — unmatched stay PENDING`);
            }
          } else {
            idsToUpdate = stillPending.map((r) => r.id);
            console.log(`[schedule-sync:FULL_ACK] no partialIds → updating all idsToUpdate=[${idsToUpdate.join(",")}]`);
          }

          if (idsToUpdate.length > 0) {
            await db
              .update(motorSchedules)
              .set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() })
              .where(inArray(motorSchedules.id, idsToUpdate));
            console.log(`[schedule-sync:DB_UPDATE] starter=${starter.id} set SCHEDULED for ids=[${idsToUpdate.join(",")}]`);
            logger.info(`[schedule-sync] starter=${starter.id} updated ${idsToUpdate.length}/${stillPending.length} schedule(s) to SCHEDULED`);
          } else {
            console.log(`[schedule-sync:DB_UPDATE] starter=${starter.id} idsToUpdate empty — NO DB update performed`);
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

/**
 * Background sync trigger for schedules just created via the create endpoint.
 * Only pushes for starters whose new schedule falls within the next 3-day sync window.
 */
export async function triggerSyncForCreatedSchedules(records: any[]) {
  const today = todayAsYYMMDD();
  const windowEnd = dateToYYMMDD(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
  const arr = Array.isArray(records) ? records : [records];

  const starterIds = [...new Set(
    arr
      .filter(r => r.starter_id && r.schedule_start_date >= today && r.schedule_start_date <= windowEnd)
      .map(r => r.starter_id as number),
  )];
  if (starterIds.length === 0) return;

  const starters = await db.query.starterBoxes.findMany({
    where: (s, { inArray: inArr }) => inArr(s.id, starterIds),
    columns: { id: true, mac_address: true, pcb_number: true, device_allocation: true },
  });

  await Promise.allSettled(starters.map(s => pushPendingSchedulesForStarter(s as any)));
}
