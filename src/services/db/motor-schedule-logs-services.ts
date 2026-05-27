import { eq, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorScheduleLogs } from "../../database/schemas/motor-schedule-logs.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";

type ScheduleLogEvent =
  | "CREATED"
  | "SENT_TO_DEVICE"
  | "DEVICE_ACK_CREATE"
  | "RESENT"
  | "STOP_SENT"
  | "DEVICE_ACK_STOP"
  | "RESTART_SENT"
  | "DEVICE_ACK_RESTART"
  | "DELETE_SENT"
  | "DEVICE_ACK_DELETE"
  | "STATUS_CHANGED"
  | "LIVE_DATA_RECEIVED";

export async function insertScheduleLog(data: {
  schedule_id: number;
  event_type: ScheduleLogEvent;
  actor_type?: string;
  actor_id?: number;
  old_status?: string;
  new_status?: string;
  details?: Record<string, any>;
}) {
  const [row] = await db
    .insert(motorScheduleLogs)
    .values({
      schedule_id: data.schedule_id,
      event_type: data.event_type,
      actor_type: data.actor_type ?? null,
      actor_id: data.actor_id ?? null,
      old_status: data.old_status ?? null,
      new_status: data.new_status ?? null,
      details: data.details ?? null,
    })
    .returning();
  return row;
}

export async function findScheduleLogsByScheduleId(
  scheduleId: number,
  page: number,
  limit: number,
) {
  const offset = (page - 1) * limit;

  const [records, countResult] = await Promise.all([
    db.query.motorScheduleLogs.findMany({
      where: eq(motorScheduleLogs.schedule_id, scheduleId),
      orderBy: (t, { desc }) => [desc(t.created_at)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(motorScheduleLogs)
      .where(eq(motorScheduleLogs.schedule_id, scheduleId)),
  ]);

  const total = countResult[0]?.count ?? 0;
  return { records, pagination: getPaginationData(page, limit, total) };
}
