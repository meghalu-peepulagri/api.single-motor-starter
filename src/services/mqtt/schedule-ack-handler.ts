/**
 * Schedule MQTT ACK Handlers (Device → Cloud)
 *
 * handleSchedulingAck    — T=33, covers both creation ACK and update ACK
 * handleScheduleDataAck  — T=37, device reports its stored schedule list
 *
 * These are called from selectTopicAck() in mqtt-db-services.ts.
 */

import { logger } from "../../utils/logger.js";
import { bitmaskToScheduleIds } from "./schedule-publisher.js";
import { resolveScheduleAck } from "./schedule-ack-tracker.js";

function getMac(topic: string): string | null {
  return topic.split("/")[1] || null;
}

// ─── T=33: SCHEDULING_ACK ─────────────────────────────────────────────────────

/**
 * Handles T=33 from the device.
 *
 * Creation ACK:  { T: 33, S: n, D: 4 }               D is a number
 *   D=1 → processed (single chunk, complete)
 *   D=4 → waiting for next chunk (more coming)         ← both are success
 *   D=0 → rejected / failure
 *   D=2 → flash memory issue
 *
 * Update ACK:    { T: 33, S: n, D: { ids: n, ack: n } }  D is an object
 *   ack=1 → stop confirmed
 *   ack=2 → restart confirmed
 *   ack=3 → delete confirmed
 */
export function handleSchedulingAck(message: any, topic: string): void {
  const mac = getMac(topic);
  if (!mac) {
    logger.warn("SCHEDULING_ACK: could not extract MAC from topic", { topic });
    return;
  }

  const seq: number = message.S;
  const D = message.D;

  let success: boolean;
  let detail: string;

  if (typeof D === "number") {
    // Creation ACK
    success = D === 1 || D === 4;
    detail = D === 1 ? "complete" : D === 4 ? "more-chunks-expected" : D === 0 ? "rejected" : "flash-error";
    logger.mqtt(`SCHEDULING_ACK (creation) | mac=${mac} seq=${seq} D=${D} success=${success} detail=${detail}`);
  } else if (D !== null && typeof D === "object") {
    // Update ACK (stop / restart / delete)
    const ack: number = D.ack;
    const ids: number = D.ids;
    success = ack === 1 || ack === 2 || ack === 3;
    const cmdLabel = ack === 1 ? "STOP" : ack === 2 ? "RESTART" : ack === 3 ? "DELETE" : `ack=${ack}`;
    logger.mqtt(`SCHEDULING_ACK (update) | mac=${mac} seq=${seq} cmd=${cmdLabel} ids=${ids} targets=[${bitmaskToScheduleIds(ids).join(",")}] success=${success}`);
  } else {
    success = false;
    logger.warn(`SCHEDULING_ACK: unexpected D shape | mac=${mac} seq=${seq} D=${JSON.stringify(D)}`);
  }

  const resolved = resolveScheduleAck(mac, seq, success);
  if (!resolved) {
    // No pending entry — either a duplicate ACK, a very late response, or an unsolicited ACK
    logger.warn(`SCHEDULING_ACK: no pending entry | mac=${mac} seq=${seq} (duplicate or late?)`);
  }
}

// ─── T=37: SCHEDULING_DATA_REQUEST_ACK ───────────────────────────────────────

/**
 * Handles T=37: device responds to a schedule status query (T=7).
 * Device returns its current stored schedule list.
 *
 * { T: 37, S: n, D: { idx, last, sch_cnt, plr, m: [{ mid, sch: [...] }] } }
 */
export function handleScheduleDataAck(message: any, topic: string): void {
  const mac = getMac(topic);
  if (!mac) {
    logger.warn("SCHEDULING_DATA_ACK: could not extract MAC from topic", { topic });
    return;
  }

  const seq: number = message.S;
  const D = message.D;

  if (!D) {
    logger.warn(`SCHEDULING_DATA_ACK: empty D | mac=${mac} seq=${seq}`);
    resolveScheduleAck(mac, seq, false);
    return;
  }

  const totalSchedules = D.sch_cnt ?? 0;
  logger.mqtt(`SCHEDULING_DATA_ACK | mac=${mac} seq=${seq} sch_cnt=${totalSchedules} idx=${D.idx} last=${D.last}`);

  // Log each motor's schedule list for now
  // TODO: reconcile device schedule list with DB (detect missing/extra schedules)
  if (Array.isArray(D.m)) {
    for (const motorGroup of D.m) {
      const scheduleIds = motorGroup.sch?.map((s: any) => s.id) ?? [];
      logger.mqtt(`  Motor mid=${motorGroup.mid}: device has schedule ids=[${scheduleIds.join(",")}]`);
    }
  }

  resolveScheduleAck(mac, seq, true);
}
