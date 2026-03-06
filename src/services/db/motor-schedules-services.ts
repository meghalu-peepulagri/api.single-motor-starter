import { and, eq, inArray, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";

const ACTIVE_STATUSES = ["RUNNING", "PENDING", "SCHEDULED"] as const;

// =================== AUTO-INCREMENT SCHEDULE ID PER MOTOR ===================

/**
 * Get the next schedule_id for a given motor.
 * Returns max(schedule_id) + 1 for that motor, or 1 if no schedules exist.
 */
export async function getNextScheduleIdForMotor(motorId: number): Promise<number> {
  const result = await db
    .select({ maxId: sql<number>`COALESCE(MAX(${motorSchedules.schedule_id}), 0)` })
    .from(motorSchedules)
    .where(eq(motorSchedules.motor_id, motorId));

  return (result[0]?.maxId ?? 0) + 1;
}

// =================== CONFLICT DETECTION QUERIES ===================

/**
 * Find active schedules for a motor that could conflict.
 * Filters by schedule_date and/or overlapping days_of_week — no schedule_type comparison.
 * Optionally excludes a specific schedule ID (for updates).
 */
export async function findConflictingSchedules(
  motorId: number,
  scheduleDate?: string | null,
  daysOfWeek: number[] = [],
  excludeScheduleId?: number,
) {
  const conditions: any[] = [
    eq(motorSchedules.motor_id, motorId),
    inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
  ];

  if (excludeScheduleId) {
    conditions.push(ne(motorSchedules.id, excludeScheduleId));
  }

  // Build date/day filter: match by exact date OR overlapping days
  const dateOrDayConditions: any[] = [];

  if (scheduleDate) {
    dateOrDayConditions.push(eq(motorSchedules.schedule_date, scheduleDate));
  }

  if (daysOfWeek.length > 0) {
    dateOrDayConditions.push(
      sql`${motorSchedules.days_of_week} && ARRAY[${sql.join(daysOfWeek.map(d => sql`${d}`), sql`,`)}]::integer[]`,
    );
  }

  if (dateOrDayConditions.length > 0) {
    conditions.push(
      dateOrDayConditions.length === 1
        ? dateOrDayConditions[0]
        : sql`(${sql.join(dateOrDayConditions, sql` OR `)})`,
    );
  }

  return await db.query.motorSchedules.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      schedule_date: true,
      days_of_week: true,
    },
  });
}

// =================== SCHEDULE LOOKUP QUERIES ===================

/**
 * Find an active schedule by its ID (for stop operation).
 */
export async function findActiveScheduleById(scheduleId: number) {
  return await db.query.motorSchedules.findFirst({
    where: and(
      eq(motorSchedules.id, scheduleId),
      inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
    ),
  });
}

/**
 * Find all active/pending schedules for a motor (for stop-all operation).
 */
export async function findAllActiveSchedulesForMotor(motorId: number) {
  return await db.query.motorSchedules.findMany({
    where: and(
      eq(motorSchedules.motor_id, motorId),
      inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
    ),
  });
}

// =================== SCHEDULE STATUS OPERATIONS ===================

/**
 * Batch update schedule status to CANCELLED for multiple schedule IDs.
 */
export async function cancelSchedulesByIds(scheduleIds: number[]) {
  if (scheduleIds.length === 0) return;

  return await db
    .update(motorSchedules)
    .set({
      schedule_status: "CANCELLED",
      manually_stopped: true,
      updated_at: new Date(),
    })
    .where(inArray(motorSchedules.id, scheduleIds))
    .returning();
}

/**
 * Stop a single schedule (mark as CANCELLED + manually_stopped).
 */
export async function stopScheduleById(scheduleId: number) {
  return await db
    .update(motorSchedules)
    .set({
      schedule_status: "CANCELLED",
      manually_stopped: true,
      updated_at: new Date(),
    })
    .where(eq(motorSchedules.id, scheduleId))
    .returning();
}

/**
 * Restart a schedule (mark as PENDING + clear manually_stopped).
 */
export async function restartScheduleById(scheduleId: number) {
  return await db
    .update(motorSchedules)
    .set({
      schedule_status: "PENDING",
      manually_stopped: false,
      updated_at: new Date(),
    })
    .where(eq(motorSchedules.id, scheduleId))
    .returning();
}

// =================== LIST WITH FILTERS ===================

/**
 * Find schedules by starter_id, motor_id, and/or status with pagination.
 */
export async function findSchedulesByFilters(
  filters: { starter_id?: number; motor_id?: number; status?: string, type?: string },
  page = 1, limit = 10,
) {
  const conditions: any[] = [ne(motorSchedules.status, "ARCHIVED")];

  if (filters.starter_id) {
    conditions.push(eq(motorSchedules.starter_id, filters.starter_id));
  }
  if (filters.motor_id) {
    conditions.push(eq(motorSchedules.motor_id, filters.motor_id));
  }
  if (filters.status) {
    conditions.push(eq(motorSchedules.schedule_status, filters.status as any));
  }
  if (filters.type) {
    conditions.push(eq(motorSchedules.schedule_type, filters.type as any));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(motorSchedules)
    .where(whereClause);

  const total_records = countResult[0]?.count || 0;
  const total_pages = Math.ceil(total_records / limit) || 1;
  const offset = (page - 1) * limit;

  const pagination_info = {
    total_records,
    total_pages,
    page_size: limit,
    current_page: page > total_pages ? total_pages : page,
    next_page: page >= total_pages ? null : page + 1,
    prev_page: page <= 1 ? null : page - 1,
  };

  if (total_records === 0) {
    return { pagination_info, records: [] };
  }

  const records = await db.query.motorSchedules.findMany({
    where: whereClause,
    orderBy: (ms, { desc }) => [desc(ms.created_at)],
    limit,
    offset,
  });

  return { pagination_info, records };
}
