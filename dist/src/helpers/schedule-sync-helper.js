import { inArray } from "drizzle-orm";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { assignDeviceScheduleIds } from "../services/db/motor-schedules-services.js";
import { logger } from "../utils/logger.js";
import { findMaxAckedEndDatePerStarter, findPendingSchedulesForStarter } from "../services/db/motor-schedules-services.js";
import { buildDeviceSyncPayloads, dateToYYMMDD, todayAsYYMMDD } from "./motor-schedule-payload-helper.js";
import { publishMultipleTimesInBackground } from "./settings-helpers.js";
import { publishingMap, schedulePartialAckMap } from "./ack-tracker-hepler.js";
/**
 * Settings publishes (T:4) and our schedule publish (T:3) share the same
 * publishingMap lock keyed by starter id. If T:4 is in flight when we fire,
 * publishMultipleTimesInBackground would return false immediately. Poll the
 * lock briefly so we can publish once it clears, instead of dropping the chunk.
 */
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
 * Push all unacknowledged motor schedules for ONE starter via MQTT.
 * Returns counts for observability. Safe to call fire-and-forget — errors are caught
 * and logged so MQTT message handlers never crash because of a sync failure.
 *
 * Called from the heartbeat handler when a device transitions to online.
 */
export async function pushPendingSchedulesForStarter(starter, motorId) {
    // A publish is already in flight for this starter (from a previous heartbeat or settings sync).
    // Skip rather than queue up a duplicate fetch with stale PENDING records — next heartbeat will retry.
    if (publishingMap.get(starter.id)) {
        logger.info(`[schedule-sync] publish already in progress for starter=${starter.id}, skipping`);
        return { chunks: 0, acked: 0 };
    }
    let chunksSent = 0;
    let acked = 0;
    try {
        // Anchor check: if the device still has acknowledged schedules whose end date
        // is today or later, withhold the next batch until those dates have passed.
        const today = todayAsYYMMDD();
        const anchorMap = await findMaxAckedEndDatePerStarter(today);
        const maxEndDate = anchorMap.get(starter.id);
        if (maxEndDate != null && today <= maxEndDate) {
            logger.info(`[schedule-sync] starter=${starter.id} has schedules active until ${maxEndDate}, skipping next batch`);
            return { chunks: 0, acked: 0 };
        }
        const twoDaysLater = new Date();
        twoDaysLater.setDate(twoDaysLater.getDate() + 2);
        const windowEnd = dateToYYMMDD(twoDaysLater);
        const allRecords = await findPendingSchedulesForStarter(starter.id, motorId);
        const records = allRecords?.filter(r => r.schedule_start_date != null && r.schedule_start_date <= windowEnd) ?? [];
        if (records.length === 0)
            return { chunks: 0, acked: 0 };
        // Derive the publish key (MAC or PCB) the same way publishMultipleTimesInBackground does,
        // so we can look up partial ACK results in schedulePartialAckMap after publish.
        const publishKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
        const grouped = buildDeviceSyncPayloads(records);
        for (const { chunks } of grouped) {
            for (const { payload, dbIds, scheduleIds } of chunks) {
                chunksSent++;
                // Settings publish (T:4) may have grabbed publishingMap after our check above; wait it out.
                const lockFree = await waitForPublishLock(starter.id);
                if (!lockFree) {
                    logger.warn(`[schedule-sync] publish lock still held after wait for starter=${starter.id}; will retry next heartbeat`);
                    continue;
                }
                // Re-verify these records are still PENDING before publishing — a concurrent
                // heartbeat may have already delivered and acknowledged them while we waited for the lock.
                const stillPending = await db.query.motorSchedules.findMany({
                    where: (ms, { and, inArray: inArr, eq }) => and(inArr(ms.id, dbIds), eq(ms.acknowledgement, 0)),
                    columns: { id: true, schedule_id: true },
                });
                if (stillPending.length === 0) {
                    logger.info(`[schedule-sync] starter=${starter.id} chunk already acknowledged, skipping`);
                    continue;
                }
                const ok = await publishMultipleTimesInBackground(payload, starter);
                if (ok) {
                    acked++;
                    // Check for partial ACK: device may have only confirmed a subset of schedule_ids.
                    // schedulePartialAckMap is populated by scheduleCreationAckResolver before resolving.
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
                            .set({
                            schedule_status: "SCHEDULED",
                            acknowledgement: 1,
                            acknowledged_at: new Date(),
                            updated_at: new Date(),
                        })
                            .where(inArray(motorSchedules.id, idsToUpdate));
                        // Assign device_schedule_id to confirmed records in slot order
                        const toAssign = stillPending.filter(r => idsToUpdate.includes(r.id));
                        await assignDeviceScheduleIds(starter.id, toAssign).catch(err => logger.warn(`[schedule-sync] assignDeviceScheduleIds failed for starter=${starter.id}: ${err?.message}`));
                        logger.info(`[schedule-sync] starter=${starter.id} updated ${idsToUpdate.length}/${stillPending.length} schedule(s) to SCHEDULED`);
                    }
                }
                else {
                    logger.warn(`[schedule-sync] starter=${starter.id} publish failed or no ACK, will retry next heartbeat`);
                    // Clean up any stale partial ACK entry that arrived despite the publish failure.
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
