import { eq, inArray } from "drizzle-orm";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { logger } from "../utils/logger.js";
import { findAndDeleteExpiredSchedules, findMaxAckedEndDatePerStarter, findPendingSchedulesForStarter } from "../services/db/motor-schedules-services.js";
import { buildDeviceSyncPayloads, dateToYYMMDD, todayAsYYMMDD } from "./motor-schedule-payload-helper.js";
import { publishMultipleTimesInBackground } from "./settings-helpers.js";
import { publishingMap, schedulePartialAckMap } from "./ack-tracker-hepler.js";
async function waitForPublishLock(starterId, maxWaitMs = 30000, intervalMs = 500) {
    const start = Date.now();
    while (publishingMap.get(starterId)) {
        if (Date.now() - start > maxWaitMs)
            return false;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return true;
}
/**
 * Push all unacknowledged PENDING schedules for ONE starter via MQTT.
 * Before publishing:
 *   1. Expired schedules (end_date < today) are marked DELETED — frees their slots.
 *   2. PENDING records are assigned sequential device_schedule_ids starting from 1.
 */
export async function pushPendingSchedulesForStarter(starter, motorId) {
    if (publishingMap.get(starter.id)) {
        logger.info(`[schedule-sync] publish already in progress for starter=${starter.id}, skipping`);
        return { chunks: 0, acked: 0 };
    }
    let chunksSent = 0;
    let acked = 0;
    try {
        const today = todayAsYYMMDD();
        const anchorMap = await findMaxAckedEndDatePerStarter(today);
        const maxEndDate = anchorMap.get(starter.id);
        if (maxEndDate != null && today <= maxEndDate) {
            logger.info(`[schedule-sync] starter=${starter.id} has schedules active until ${maxEndDate}, skipping next batch`);
            return { chunks: 0, acked: 0 };
        }
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
        if (records.length === 0)
            return { chunks: 0, acked: 0 };
        // Step 3 — Assign sequential device_schedule_ids starting from 1 and persist to DB.
        await Promise.all(records.map((r, i) => {
            r.device_schedule_id = i + 1;
            return db.update(motorSchedules)
                .set({ device_schedule_id: i + 1 })
                .where(eq(motorSchedules.id, r.id))
                .catch(() => null);
        }));
        logger.info(`[schedule-sync] starter=${starter.id} assigned device_schedule_ids=[${records.map((_, i) => i + 1).join(",")}]`);
        const publishKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
        const grouped = buildDeviceSyncPayloads(records);
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
                const ok = await publishMultipleTimesInBackground(payload, starter);
                if (ok) {
                    acked++;
                    const partialIds = publishKey ? schedulePartialAckMap.get(publishKey) : undefined;
                    if (publishKey)
                        schedulePartialAckMap.delete(publishKey);
                    let idsToUpdate;
                    if (partialIds && partialIds.length > 0) {
                        const confirmedSet = new Set(partialIds);
                        idsToUpdate = stillPending
                            .filter((r) => confirmedSet.has(r.schedule_id))
                            .map((r) => r.id);
                        const unmatched = scheduleIds.filter((sid) => !confirmedSet.has(sid));
                        if (unmatched.length > 0) {
                            logger.warn(`[schedule-sync] starter=${starter.id} partial ACK: confirmed=[${partialIds.join(",")}] unmatched=[${unmatched.join(",")}] — unmatched stay PENDING`);
                        }
                    }
                    else {
                        idsToUpdate = stillPending.map((r) => r.id);
                    }
                    if (idsToUpdate.length > 0) {
                        await db
                            .update(motorSchedules)
                            .set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() })
                            .where(inArray(motorSchedules.id, idsToUpdate));
                        logger.info(`[schedule-sync] starter=${starter.id} updated ${idsToUpdate.length}/${stillPending.length} schedule(s) to SCHEDULED`);
                    }
                }
                else {
                    logger.warn(`[schedule-sync] starter=${starter.id} publish failed or no ACK, will retry next heartbeat`);
                    if (publishKey)
                        schedulePartialAckMap.delete(publishKey);
                }
            }
        }
        if (chunksSent > 0) {
            logger.info(`[schedule-sync] starter=${starter.id} chunks=${chunksSent} acked=${acked}`);
        }
    }
    catch (err) {
        logger.error(`[schedule-sync] failed for starter=${starter.id}: ${err?.message}`);
    }
    return { chunks: chunksSent, acked };
}
