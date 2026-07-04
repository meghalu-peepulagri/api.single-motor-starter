-- Fix motor_schedule_unique_idx: the previous index had no WHERE filter,
-- which permanently blocked slot reuse even after COMPLETED/MISSED/PARTIAL/FAILED.
-- Recreate with a partial filter so terminal/archived records free up their slot.

DROP INDEX IF EXISTS "motor_schedule_unique_idx";

CREATE UNIQUE INDEX "motor_schedule_unique_idx"
  ON "motor_schedules" ("motor_id", "schedule_id")
  WHERE status != 'ARCHIVED'
    AND schedule_status NOT IN ('COMPLETED', 'MISSED', 'PARTIAL', 'FAILED', 'DELETED');
