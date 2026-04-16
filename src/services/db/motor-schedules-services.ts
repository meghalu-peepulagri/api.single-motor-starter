import { and, eq, gte, inArray, lte, ne, SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import BadRequestException from "../../exceptions/bad-request-exception.js";

type DbTransaction = Parameters<Parameters<typeof db["transaction"]>[0]>[0];
import { motorSchedules, type MotorSchedule } from "../../database/schemas/motor-schedules.js";
import type { MotorScheduleFilters } from "../../helpers/motor-schedule-filter-helper.js";
import {
  buildScheduleData,
  dateToYYMMDD,
  normalizeMotorSchedulePayload,
  todayAsYYMMDD
} from "../../helpers/motor-schedule-payload-helper.js";
import {
  checkIntraArrayConflicts,
  checkMotorScheduleConflict,
  validateScheduleTypeRules
} from "../../helpers/motor-helper.js";
import { validatedRequest } from "../../validations/validate-request.js";
import {
  CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
  MOTOR_NOT_FOUND
} from "../../constants/app-constants.js";
import {
  getSingleRecordByMultipleColumnValues,
  saveRecords
} from "./base-db-services.js";
import { motors } from "../../database/schemas/motors.js";
import type { ValidatedMotorSchedule, ValidatedMotorScheduleArray } from "../../validations/schema/motor-schedule-validators.js";

const ACTIVE_STATUSES = ["RUNNING", "PENDING", "SCHEDULED", "WAITING_NEXT_CYCLE"] as const;

// =================== AUTO-INCREMENT SCHEDULE ID PER MOTOR ===================

/**
 * Get the next schedule_id for a given motor.
 * First tries to reuse the lowest schedule_id from ARCHIVED/DELETED schedules.
 * If no reusable ID found, returns max(schedule_id) + 1, or 1 if no schedules exist.
 */
export async function getNextScheduleIdForMotor(motorId: number): Promise<number> {
  // Find the lowest schedule_id from deleted/archived rows
  // that is NOT used by any active row for the same motor
  const reusable = await db
    .select({ scheduleId: motorSchedules.schedule_id })
    .from(motorSchedules)
    .where(and(
      eq(motorSchedules.motor_id, motorId),
      sql`(${motorSchedules.status} = 'ARCHIVED' OR ${motorSchedules.schedule_status} IN ('DELETED', 'CANCELLED'))`,
      sql`NOT EXISTS (
        SELECT 1 FROM motor_schedules ms2
        WHERE ms2.motor_id = ${motorId}
          AND ms2.schedule_id = ${motorSchedules.schedule_id}
          AND ms2.status != 'ARCHIVED'
          AND ms2.schedule_status NOT IN ('DELETED', 'CANCELLED')
      )`,
    ))
    .orderBy(motorSchedules.schedule_id)
    .limit(1);

  if (reusable.length > 0) {
    return reusable[0].scheduleId;
  }

  // No reusable ID found — fallback to max + 1
  const result = await db
    .select({ maxId: sql<number>`COALESCE(MAX(${motorSchedules.schedule_id}), 0)` })
    .from(motorSchedules)
    .where(eq(motorSchedules.motor_id, motorId));

  return (result[0]?.maxId ?? 0) + 1;
}

// =================== CONFLICT DETECTION QUERIES ===================

/**
 * Find active schedules for a motor that could conflict.
 * Filters by date range overlap and/or overlapping days_of_week.
 * Optionally excludes a specific schedule ID (for updates).
 */
export async function findConflictingSchedules(
  motorId: number,
  scheduleStartDate?: number | null,
  scheduleEndDate?: number | null,
  daysOfWeek: number[] = [],
  excludeScheduleId?: number,
) {
  const conditions: SQL[] = [
    eq(motorSchedules.motor_id, motorId),
    ne(motorSchedules.status, "ARCHIVED"),
    inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
  ];

  if (excludeScheduleId) {
    conditions.push(ne(motorSchedules.id, excludeScheduleId));
  }

  // Build date/day filter: match by date range overlap OR overlapping days
  const dateOrDayConditions: SQL[] = [];

  if (scheduleStartDate && scheduleEndDate) {
    // Date range overlap: existing.start <= new.end AND existing.end >= new.start
    dateOrDayConditions.push(
      sql`${motorSchedules.schedule_start_date} <= ${scheduleEndDate} AND ${motorSchedules.schedule_end_date} >= ${scheduleStartDate}`,
    );
  } else if (scheduleStartDate) {
    // Fallback: single date match (start date only)
    dateOrDayConditions.push(
      sql`${motorSchedules.schedule_start_date} <= ${scheduleStartDate} AND ${motorSchedules.schedule_end_date} >= ${scheduleStartDate}`,
    );
  }

  if (daysOfWeek.length > 0) {
    dateOrDayConditions.push(
      sql`${motorSchedules.days_of_week} && ARRAY[${sql.join(daysOfWeek.map(d => sql`${d}`), sql`,`)}]::int[]`,
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
      schedule_start_date: true,
      schedule_end_date: true,
      days_of_week: true,
    },
  });
}

// =================== FIND BY SCHEDULE_ID (per-motor ID) ===================

/**
 * Find an active schedule by its schedule_id (per-motor auto-increment ID).
 */
export async function findScheduleByScheduleId(scheduleId: number) {
  return await db.query.motorSchedules.findFirst({
    where: and(
      eq(motorSchedules.schedule_id, scheduleId),
      inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
      ne(motorSchedules.status, "ARCHIVED"),
    ),
    columns: {
      id: true,
      schedule_id: true,
      schedule_status: true,
      acknowledgement: true,
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
 * Batch stop schedules by IDs (mark as STOPPED + manually_stopped).
 */
export async function cancelSchedulesByIds(scheduleIds: number[]) {
  if (scheduleIds.length === 0) return;

  return await db
    .update(motorSchedules)
    .set({
      schedule_status: "STOPPED",
      manually_stopped: true,
      updated_at: new Date(),
    })
    .where(inArray(motorSchedules.id, scheduleIds))
    .returning();
}

/**
 * Stop a single schedule (mark as STOPPED + manually_stopped).
 */
export async function stopScheduleById(scheduleId: number) {
  return await db
    .update(motorSchedules)
    .set({
      schedule_status: "STOPPED",
      manually_stopped: true,
      updated_at: new Date(),
    })
    .where(eq(motorSchedules.id, scheduleId))
    .returning();
}

/**
 * Restart a schedule (mark as SCHEDULED + clear manually_stopped).
 */
export async function restartScheduleById(scheduleId: number) {
  return await db
    .update(motorSchedules)
    .set({
      schedule_status: "SCHEDULED",
      manually_stopped: false,
      updated_at: new Date(),
    })
    .where(eq(motorSchedules.id, scheduleId))
    .returning();
}

// =================== MAX END DATE FOR DATE RANGE FILTER ===================

/**
 * Get the highest schedule_end_date for a given motor and starter.
 */
export async function getMaxEndDate(motorId: number, starterId: number): Promise<number | null> {
  const result = await db
    .select({ maxEndDate: sql<number>`MAX(${motorSchedules.schedule_end_date})` })
    .from(motorSchedules)
    .where(and(
      eq(motorSchedules.motor_id, motorId),
      eq(motorSchedules.starter_id, starterId),
      ne(motorSchedules.status, "ARCHIVED"),
    ));

  return result[0]?.maxEndDate ?? null;
}

// =================== LIST WITH FILTERS ===================

/**
 * Find schedules with filters and pagination.
 */
export async function findSchedulesByFilters(
  filters: MotorScheduleFilters,
  page = 1, limit = 10,
) {
  const conditions: SQL[] = [ne(motorSchedules.status, "ARCHIVED")];

  if (filters.starter_id) {
    conditions.push(eq(motorSchedules.starter_id, filters.starter_id));
  }
  if (filters.motor_id) {
    conditions.push(eq(motorSchedules.motor_id, filters.motor_id));
  }
  if (filters.schedule_status) {
    conditions.push(eq(motorSchedules.schedule_status, filters.schedule_status as MotorSchedule["schedule_status"]));
  }
  if (filters.type) {
    conditions.push(eq(motorSchedules.schedule_type, filters.type as MotorSchedule["schedule_type"]));
  }
  if (filters.schedule_start_date) {
    // Find schedules whose date range contains the given start date:
    // schedule_start_date <= filter_date AND schedule_end_date >= filter_date
    conditions.push(lte(motorSchedules.schedule_start_date, filters.schedule_start_date));
    conditions.push(gte(motorSchedules.schedule_end_date, filters.schedule_start_date));
  } else if (filters.schedule_end_date) {
    conditions.push(lte(motorSchedules.schedule_start_date, filters.schedule_end_date));
  }
  if (filters.repeat !== undefined) {
    conditions.push(eq(motorSchedules.repeat, filters.repeat));
  }
  if (filters.enabled !== undefined) {
    conditions.push(eq(motorSchedules.enabled, filters.enabled));
  }
  if (filters.day_of_week !== undefined) {
    conditions.push(sql`${motorSchedules.days_of_week} @> ARRAY[${filters.day_of_week}]::int[]`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, runningCountResult] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(motorSchedules)
      .where(whereClause),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(motorSchedules)
      .where(whereClause ? and(whereClause, eq(motorSchedules.schedule_status, "RUNNING")) : eq(motorSchedules.schedule_status, "RUNNING")),
  ]);

  const total_records = countResult[0]?.count || 0;
  const running_count = runningCountResult[0]?.count || 0;
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

  const schedule_summary = {
    total_schedules: total_records,
    running_count,
  };

  if (total_records === 0) {
    return { pagination_info, schedule_summary, records: [] };
  }

  const records = await db.query.motorSchedules.findMany({
    where: whereClause,
    orderBy: (ms, { desc }) => [desc(ms.created_at)],
    limit,
    offset,
  });

  return { pagination_info, schedule_summary, records };
}

// =================== PENDING SCHEDULES FOR DEVICE SYNC ===================

/**
 * Fetch unacknowledged, active schedules where schedule_start_date is within
 * today and next 2 days (3 days total: today, tomorrow, day after).
 * Only schedules with ack=0 and a valid start date.
 */
export async function findPendingSchedulesForSync() {
  const today = new Date();
  const twoDaysLater = new Date(today);
  twoDaysLater.setDate(today.getDate() + 2);
  const todayNum = dateToYYMMDD(today);
  const lastDayNum = dateToYYMMDD(twoDaysLater);

  return await db.query.motorSchedules.findMany({
    where: and(
      eq(motorSchedules.acknowledgement, 0),
      eq(motorSchedules.enabled, true),
      ne(motorSchedules.status, "ARCHIVED"),
      inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
      gte(motorSchedules.schedule_start_date, todayNum),
      lte(motorSchedules.schedule_start_date, lastDayNum),
    ),
    columns: {
      id: true,
      starter_id: true,
      schedule_id: true,
      schedule_type: true,
      schedule_start_date: true,
      schedule_end_date: true,
      start_time: true,
      end_time: true,
      runtime_minutes: true,
      cycle_on_minutes: true,
      cycle_off_minutes: true,
      repeat: true,
      days_of_week: true,
      bit_wise_days: true,
      power_loss_recovery: true,
      power_loss_recovery_time: true,
      enabled: true,
    },
    orderBy: (ms, { asc }) => [asc(ms.starter_id), asc(ms.schedule_id)],
  });
}

// =================== BATCH STATUS UPDATE FOR SYNC ===================

/**
 * Batch update schedule statuses grouped by newStatus.
 * Max 3 queries (RUNNING, COMPLETED, WAITING_NEXT_CYCLE) instead of N individual updates.
 */
export async function batchUpdateScheduleStatuses(
  groups: {
    status: "RUNNING" | "COMPLETED" | "WAITING_NEXT_CYCLE";
    ids: number[];
    last_started_at?: Date;
    last_stopped_at?: Date;
  }[],
) {
  const results = [];
  for (const group of groups) {
    if (group.ids.length === 0) continue;

    const setData: {
      schedule_status: MotorSchedule["schedule_status"];
      updated_at: Date;
      last_started_at?: Date;
      last_stopped_at?: Date;
    } = {
      schedule_status: group.status,
      updated_at: new Date(),
    };
    if (group.last_started_at) setData.last_started_at = group.last_started_at;
    if (group.last_stopped_at) setData.last_stopped_at = group.last_stopped_at;

    const result = await db
      .update(motorSchedules)
      .set(setData)
      .where(inArray(motorSchedules.id, group.ids))
      .returning({ id: motorSchedules.id });

    results.push(...result);
  }
  return results;
}

// =================== EVALUATABLE SCHEDULES FOR STATUS SYNC ===================

/**
 * Fetch all schedules whose status can be evaluated by the cron sync.
 * Targets: SCHEDULED, RUNNING, WAITING_NEXT_CYCLE (enabled & not archived).
 */
export async function findEvaluatableSchedules() {
  return await db.query.motorSchedules.findMany({
    where: and(
      eq(motorSchedules.enabled, true),
      ne(motorSchedules.status, "ARCHIVED"),
      inArray(motorSchedules.schedule_status, ["SCHEDULED", "RUNNING", "WAITING_NEXT_CYCLE"]),
    ),
    columns: {
      id: true,
      schedule_type: true,
      schedule_status: true,
      start_time: true,
      end_time: true,
      schedule_start_date: true,
      schedule_end_date: true,
      days_of_week: true,
      repeat: true,
      runtime_minutes: true,
      last_started_at: true,
      enabled: true,
    },
  });
}

// =================== ACTUAL SCHEDULE FIELDS ===================

export async function updateActualScheduleFields(
  motorId: number,
  starterId: number,
  scheduleId: number,
  actualData: {
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_run_time: number | null;
    actual_type: "TIME_BASED" | "CYCLIC" | null;
    missed_minutes?: number | null;
    failure_at?: Date | null;
    failure_reason?: string | null;
  },
  trx: DbTransaction
) {
  await trx
    .update(motorSchedules)
    .set({
      actual_start_time: actualData.actual_start_time,
      actual_end_time: actualData.actual_end_time,
      actual_run_time: actualData.actual_run_time,
      actual_type: actualData.actual_type,
      missed_minutes: actualData.missed_minutes ?? 0,
      failure_at: actualData.failure_at ?? null,
      failure_reason: actualData.failure_reason ?? null,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(motorSchedules.motor_id, motorId),
        eq(motorSchedules.starter_id, starterId),
        eq(motorSchedules.schedule_id, scheduleId),
        sql`${motorSchedules.status} != 'ARCHIVED'`,
        sql`${motorSchedules.schedule_status} NOT IN ('DELETED', 'CANCELLED')`,
      )
    );
}

export async function bulkCreateMotorSchedules(
  rawPayload: any | any[],
  userId: number,
) {
  // 1. Normalize and Validate the entire batch
  const normalized = normalizeMotorSchedulePayload(rawPayload);
  const items = await validatedRequest<ValidatedMotorScheduleArray>(
    "create-bulk-motor-schedule",
    normalized,
    CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
  );

  if (items.length === 0) throw new BadRequestException("Payload cannot be empty");

  // 2. Ensure all schedules belong to the same motor
  const motorId = items[0].motor_id;
  if (!items.every((item) => item.motor_id === motorId)) {
    throw new BadRequestException("All schedules in a bulk request must belong to the same motor");
  }

  // Verify motor exists and is active
  const existedMotor = await getSingleRecordByMultipleColumnValues(
    motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], ["id"],
  );
  if (!existedMotor) throw new BadRequestException(MOTOR_NOT_FOUND);

  // 3. Normalize dates and apply schedule-specific business rules
  const preparedList = items.map((data) => {
    validateScheduleTypeRules(data);
    const scheduleStartDate = data.schedule_start_date || todayAsYYMMDD();
    const scheduleEndDate = data.schedule_end_date || scheduleStartDate;
    return { ...data, schedule_start_date: scheduleStartDate, schedule_end_date: scheduleEndDate };
  });

  // 4. Multi-layer Conflict Detection
  // Layer A: Check for overlaps within the requested batch itself
  checkIntraArrayConflicts(preparedList);

  // Layer B: Check against existing schedules in the database
  const startDates = preparedList.map((s) => s.schedule_start_date!);
  const endDates = preparedList.map((s) => s.schedule_end_date!);
  const allDays = Array.from(new Set(preparedList.flatMap((s) => s.days_of_week || [])));

  const existingInDb = await findConflictingSchedules(
    motorId,
    Math.min(...startDates),
    Math.max(...endDates),
    allDays,
  );

  for (const schedule of preparedList) {
    checkMotorScheduleConflict(schedule, existingInDb);
  }

  // 5. Finalize data and perform Bulk Database Insertion
  const startingScheduleId = await getNextScheduleIdForMotor(motorId);

  const finalPayload = preparedList.map((item, index) => ({
    ...buildScheduleData(item, item.schedule_start_date!),
    schedule_id: startingScheduleId + index,
    created_by: userId,
    enabled: item.enabled ?? true,
    schedule_status: item.schedule_status ?? "PENDING",
  }));

  return await saveRecords(motorSchedules, finalPayload as any);
}
