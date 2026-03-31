/**
 * Schedule MQTT Publisher
 *
 * All outbound schedule commands (Cloud → Device) are built and sent here.
 * Each publish waits for the device ACK before resolving.
 *
 * T=3 with m1 array  → Schedule creation (one chunk at a time)
 * T=3 with cmd+ids   → Schedule update: stop(1) / restart(2) / delete(3)
 * T=7                → Query device's current stored schedules
 */

import type { StarterBox } from "../../database/schemas/starter-boxes.js";
import { randomSequenceNumber } from "../../helpers/mqtt-helpers.js";
import { logger } from "../../utils/logger.js";
import { mqttServiceInstance } from "../mqtt-service.js";
import { registerScheduleAck } from "./schedule-ack-tracker.js";

const ACK_TIMEOUT_MS = 10_000; // 10 seconds

// ─── Topic helpers ────────────────────────────────────────────────────────────

/** MAC address (unallocated) or PCB number (allocated) — matches existing publishData() logic */
function getDeviceIdentifier(starter: StarterBox): string {
  const id = starter.device_allocation === "false"
    ? starter.mac_address
    : starter.pcb_number;
  if (!id) throw new Error(`Starter id=${starter.id} has no MAC/PCB number set`);
  return id;
}

function getCmdTopic(starter: StarterBox): string {
  return `peepul/${getDeviceIdentifier(starter)}/cmd`;
}

// ─── Bitmask conversion ────────────────────────────────────────────────────────

/**
 * Convert an array of schedule_id values (1–16) to a 16-bit bitmask.
 * schedule_id 1 → bit 0 (value 1)
 * schedule_id 2 → bit 1 (value 2)
 * schedule_id 3 → bit 2 (value 4)
 * ...
 *
 * Example: [1, 3, 4] → 1 | 4 | 8 = 13
 */
export function scheduleIdsToBitmask(scheduleIds: number[]): number {
  return scheduleIds.reduce((mask, id) => mask | (1 << (id - 1)), 0);
}

/** Reverse: bitmask → array of schedule_id values (for logging/debug) */
export function bitmaskToScheduleIds(mask: number): number[] {
  const ids: number[] = [];
  for (let i = 1; i <= 16; i++) {
    if ((mask & (1 << (i - 1))) !== 0) ids.push(i);
  }
  return ids;
}

// ─── Schedule Creation ─────────────────────────────────────────────────────────

export interface ScheduleCreationChunk {
  idx: number;
  last: 0 | 1;
  sch_cnt: number;
  plr: number;
  m1: Record<string, any>[];
}

/**
 * Publish a single schedule creation chunk (T=3 with m1 array).
 * Waits for device ACK (T=33, D=1 or D=4) before resolving.
 *
 * Returns true if device ACKed successfully, false on failure or timeout.
 */
export async function publishScheduleCreationChunk(
  starter: StarterBox,
  chunk: ScheduleCreationChunk,
): Promise<boolean> {
  const mac = getDeviceIdentifier(starter);
  const topic = getCmdTopic(starter);
  const s = randomSequenceNumber();

  const payload = { T: 3, S: s, D: chunk };

  // Register ACK waiter BEFORE publishing to avoid race condition
  const ackPromise = registerScheduleAck(mac, s, "creation", ACK_TIMEOUT_MS);
  await mqttServiceInstance.publish(topic, JSON.stringify(payload));

  logger.mqtt(`Schedule creation chunk published | mac=${mac} seq=${s} idx=${chunk.idx} last=${chunk.last} count=${chunk.m1.length}`);

  const success = await ackPromise;

  if (success) {
    logger.mqtt(`Schedule creation ACK received | mac=${mac} seq=${s} idx=${chunk.idx}`);
  } else {
    logger.warn(`Schedule creation ACK timeout/failure | mac=${mac} seq=${s} idx=${chunk.idx}`);
  }

  return success;
}

// ─── Schedule Update (Stop / Restart / Delete) ────────────────────────────────

/**
 * Publish a schedule update command (T=3 with cmd + ids bitmask).
 * cmd: 1 = stop, 2 = restart, 3 = delete
 *
 * @param scheduleIds - array of schedule_id values (1–16), NOT DB primary keys
 */
export async function publishScheduleUpdate(
  starter: StarterBox,
  scheduleIds: number[],
  cmd: 1 | 2 | 3,
): Promise<boolean> {
  if (scheduleIds.length === 0) {
    logger.warn("publishScheduleUpdate called with empty scheduleIds, skipping");
    return false;
  }

  const mac = getDeviceIdentifier(starter);
  const topic = getCmdTopic(starter);
  const s = randomSequenceNumber();
  const ids = scheduleIdsToBitmask(scheduleIds);

  const cmdLabel = cmd === 1 ? "STOP" : cmd === 2 ? "RESTART" : "DELETE";
  const payload = { T: 3, S: s, D: { cmd, ids } };

  const ackPromise = registerScheduleAck(mac, s, "update", ACK_TIMEOUT_MS);
  await mqttServiceInstance.publish(topic, JSON.stringify(payload));

  logger.mqtt(`Schedule update published | mac=${mac} seq=${s} cmd=${cmdLabel} ids=${ids} targets=[${scheduleIds.join(",")}]`);

  const success = await ackPromise;

  if (success) {
    logger.mqtt(`Schedule update ACK received | mac=${mac} seq=${s} cmd=${cmdLabel}`);
  } else {
    logger.warn(`Schedule update ACK timeout/failure | mac=${mac} seq=${s} cmd=${cmdLabel}`);
  }

  return success;
}

// ─── Schedule Status Query ─────────────────────────────────────────────────────

/**
 * Ask the device to report its currently stored schedules (T=7).
 * Device responds with T=37 (handled in schedule-ack-handler.ts).
 */
export async function publishScheduleStatusQuery(starter: StarterBox): Promise<boolean> {
  const mac = getDeviceIdentifier(starter);
  const topic = getCmdTopic(starter);
  const s = randomSequenceNumber();

  const payload = { T: 7, S: s, D: { m1: 1 } };

  const ackPromise = registerScheduleAck(mac, s, "query", ACK_TIMEOUT_MS);
  await mqttServiceInstance.publish(topic, JSON.stringify(payload));

  logger.mqtt(`Schedule status query published | mac=${mac} seq=${s}`);

  return ackPromise;
}
