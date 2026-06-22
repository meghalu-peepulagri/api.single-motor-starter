import { eq } from "drizzle-orm";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { motorScheduleLogs } from "../database/schemas/motor-schedule-logs.js";
import { evaluateScheduleStatus } from "../helpers/schedule-status-evaluator.js";
import type { ScheduleForEvaluation } from "../types/app-types.js";

const EVALUATABLE_STATUSES = ["SCHEDULED", "RUNNING", "WAITING_NEXT_CYCLE", "PARTIAL"] as const;

export function filterEvaluatable(schedules: any[]): ScheduleForEvaluation[] {
  return schedules.filter(s => EVALUATABLE_STATUSES.includes(s.schedule_status));
}

export async function runScheduleEvaluator(schedules: ScheduleForEvaluation[]) {
  if (!schedules.length) return [];

  const now = new Date();
  const transitions: { schedule_id: number; from: string; to: string; schedule: ScheduleForEvaluation }[] = [];

  for (const s of schedules) {
    const res = evaluateScheduleStatus(s, now);
    if (!res || res.newStatus === s.schedule_status) continue;
    transitions.push({ schedule_id: res.id, from: s.schedule_status, to: res.newStatus, schedule: s });
  }

  if (!transitions.length) return transitions;

  const appliedTransitions: typeof transitions = [];

  await Promise.all(
    transitions.map(async (t) => {
      const s = t.schedule;
      const setData: Record<string, any> = { schedule_status: t.to, updated_at: now };

      if (t.to === "RUNNING") {
        if (s.actual_started_at) setData.last_started_at = s.actual_started_at;
      } else if (["COMPLETED", "PARTIAL", "MISSED", "FAILED", "WAITING_NEXT_CYCLE"].includes(t.to)) {
        const stoppedAt = s.actual_ended_at ?? (s as any).end_date_time;
        if (stoppedAt) {
          setData.last_stopped_at = stoppedAt;
          if (t.to === "COMPLETED") setData.completed_at = stoppedAt;
        }
      }

      try {
        await db.update(motorSchedules).set(setData).where(eq(motorSchedules.id, t.schedule_id));
        appliedTransitions.push(t);
      } catch (err: any) {
        const code = err?.cause?.code ?? err?.code;
        if (code !== "23505") throw err;
      }
    })
  );

  if (appliedTransitions.length > 0) {
    await db.insert(motorScheduleLogs).values(
      appliedTransitions.map(t => ({
        schedule_id: t.schedule_id,
        event_type: "STATUS_CHANGED" as const,
        actor_type: "system",
        old_status: t.from,
        new_status: t.to,
      }))
    );
  }

  return transitions;
}
