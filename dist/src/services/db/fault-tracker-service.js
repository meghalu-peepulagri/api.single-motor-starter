import { and, eq, inArray } from "drizzle-orm";
import db from "../../database/configuration.js";
import { faultStatusTracker } from "../../database/schemas/fault-status-tracker.js";
import { getFaultDescription, getFaultSuffix } from "../../helpers/control-helpers.js";
import { logger } from "../../utils/logger.js";
import { sendUserNotification } from "../fcm/fcm-service.js";
const DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes
const REPEAT_MS = 30 * 60 * 1000; // 30 minutes
const FAULT_BITS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x100, 0x200, 0x400, 0x1000];
/**
 * Single entry point for fault tracking.
 * 1 SELECT to fetch all active/detected records, then only necessary writes.
 */
export async function processFaultBitmask(params) {
    const { fault, motor_id, starter_id, user_id, pump_name } = params;
    const now = new Date();
    // 1 SELECT — only fetch columns actually needed (Fix 1: column projection)
    const existingRecords = await db.select({
        id: faultStatusTracker.id,
        fault_code: faultStatusTracker.fault_code,
        status: faultStatusTracker.status,
        first_detected_at: faultStatusTracker.first_detected_at,
        last_notified_at: faultStatusTracker.last_notified_at,
        fault_description: faultStatusTracker.fault_description,
        motor_id: faultStatusTracker.motor_id,
    })
        .from(faultStatusTracker)
        .where(and(eq(faultStatusTracker.motor_id, motor_id), eq(faultStatusTracker.type, "FAULT"), inArray(faultStatusTracker.status, ["DETECTED", "ACTIVE"])));
    // Early exit: no active faults and nothing tracked — most common case
    if (fault === 0 && existingRecords.length === 0)
        return;
    const existingMap = new Map(existingRecords.map(r => [r.fault_code, r]));
    const writes = [];
    for (const bit of FAULT_BITS) {
        const existing = existingMap.get(bit) ?? null;
        if ((fault & bit) === bit) {
            writes.push(onFaultActive(bit, existing, { motor_id, starter_id, user_id, pump_name }, now));
        }
        else if (existing) {
            writes.push(onFaultCleared(existing, now));
        }
        // else: bit not active and no record → nothing to do
    }
    if (writes.length === 0)
        return;
    // Promise.allSettled — each bit is independent; one failure must not block others
    const results = await Promise.allSettled(writes);
    for (const result of results) {
        if (result.status === "rejected") {
            logger.error("[FaultTracker] A fault bit operation failed", result.reason);
        }
    }
}
async function onFaultActive(fault_code, existing, ctx, now) {
    const { motor_id, starter_id, user_id, pump_name } = ctx;
    try {
        if (!existing) {
            // First time this fault bit seen — start debounce window
            // onConflictDoNothing prevents duplicate inserts under concurrent packets
            const fault_description = getFaultDescription(fault_code);
            await db.insert(faultStatusTracker).values({
                motor_id, starter_id, user_id, fault_code, fault_description,
                type: "FAULT",
                status: "DETECTED",
                first_detected_at: now,
            }).onConflictDoNothing();
            logger.info(`[FaultTracker] DETECTED: "${fault_description}" for motor ${motor_id}`);
            return;
        }
        if (existing.status === "DETECTED") {
            const ageMs = now.getTime() - new Date(existing.first_detected_at).getTime();
            if (ageMs < DEBOUNCE_MS)
                return; // still within debounce window
            // Debounce passed — send notification first, then promote to ACTIVE
            // (notification before DB update: if FCM fails, DB stays DETECTED and retries next packet)
            const fault_description = getFaultDescription(fault_code);
            if (user_id != null) {
                // Fix 3: getFaultSuffix only computed when user_id exists (notification will actually be sent)
                const suffix = getFaultSuffix(fault_code);
                await sendUserNotification(user_id, `Unstable ${fault_description} Detected at ${pump_name}`, `${fault_description} is persisting for over 2 minutes at ${pump_name} – ${suffix}`, motor_id, starter_id);
            }
            await db.update(faultStatusTracker)
                .set({ status: "ACTIVE", notified_at: now, last_notified_at: now, updated_at: now })
                .where(eq(faultStatusTracker.id, existing.id));
            logger.info(`[FaultTracker] ACTIVE (2min passed): "${fault_description}" for motor ${motor_id}`);
            return;
        }
        if (existing.status === "ACTIVE") {
            if (!existing.last_notified_at) {
                logger.warn(`[FaultTracker] ACTIVE record id=${existing.id} has null last_notified_at — skipping repeat`);
                return;
            }
            const sinceLastMs = now.getTime() - new Date(existing.last_notified_at).getTime();
            if (sinceLastMs < REPEAT_MS)
                return; // not yet time for repeat
            // Send repeat notification first, then update last_notified_at
            // (notification before DB update: if FCM fails, timer stays unchanged and retries next packet)
            const fault_description = getFaultDescription(fault_code);
            const durationMin = Math.floor((now.getTime() - new Date(existing.first_detected_at).getTime()) / 60000);
            if (user_id != null) {
                // Fix 3: getFaultSuffix only computed when user_id exists (notification will actually be sent)
                const suffix = getFaultSuffix(fault_code);
                await sendUserNotification(user_id, `${fault_description} ongoing at ${pump_name}`, `${fault_description} active for ${durationMin} minutes at ${pump_name} – ${suffix}`, motor_id, starter_id);
            }
            await db.update(faultStatusTracker)
                .set({ last_notified_at: now, updated_at: now })
                .where(eq(faultStatusTracker.id, existing.id));
            logger.info(`[FaultTracker] REPEAT: "${fault_description}" for motor ${motor_id}, ${durationMin}min`);
        }
    }
    catch (error) {
        logger.error(`[FaultTracker] Error in onFaultActive for bit ${fault_code}`, error);
        throw error;
    }
}
async function onFaultCleared(existing, now) {
    try {
        await db.update(faultStatusTracker)
            .set({ status: "CLEARED", cleared_at: now, updated_at: now })
            .where(eq(faultStatusTracker.id, existing.id));
        logger.info(`[FaultTracker] CLEARED: "${existing.fault_description}" for motor ${existing.motor_id}`);
    }
    catch (error) {
        logger.error(`[FaultTracker] Error in onFaultCleared for id ${existing.id}`, error);
        throw error;
    }
}
