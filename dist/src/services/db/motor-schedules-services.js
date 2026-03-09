import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";
const ACTIVE_STATUSES = ["RUNNING", "PENDING", "SCHEDULED"];
// =================== AUTO-INCREMENT SCHEDULE ID PER MOTOR ===================
/**
 * Get the next schedule_id for a given motor.
 * Returns max(schedule_id) + 1 for that motor, or 1 if no schedules exist.
 */
export async function getNextScheduleIdForMotor(motorId) {
    const result = await db
        .select({ maxId: sql `COALESCE(MAX(${motorSchedules.schedule_id}), 0)` })
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
export async function findConflictingSchedules(motorId, scheduleDate, daysOfWeek = [], excludeScheduleId) {
    const conditions = [
        eq(motorSchedules.motor_id, motorId),
        inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]),
    ];
    if (excludeScheduleId) {
        conditions.push(ne(motorSchedules.id, excludeScheduleId));
    }
    // Build date/day filter: match by exact date OR overlapping days
    const dateOrDayConditions = [];
    if (scheduleDate) {
        dateOrDayConditions.push(eq(motorSchedules.schedule_start_date, scheduleDate));
    }
    if (daysOfWeek.length > 0) {
        dateOrDayConditions.push(sql `${motorSchedules.days_of_week} && ARRAY[${sql.join(daysOfWeek.map(d => sql `${d}`), sql `,`)}]::int[]`);
    }
    if (dateOrDayConditions.length > 0) {
        conditions.push(dateOrDayConditions.length === 1
            ? dateOrDayConditions[0]
            : sql `(${sql.join(dateOrDayConditions, sql ` OR `)})`);
    }
    return await db.query.motorSchedules.findMany({
        where: and(...conditions),
        columns: {
            id: true,
            start_time: true,
            end_time: true,
            schedule_start_date: true,
            days_of_week: true,
        },
    });
}
// =================== FIND BY SCHEDULE_ID (per-motor ID) ===================
/**
 * Find an active schedule by its schedule_id (per-motor auto-increment ID).
 */
export async function findScheduleByScheduleId(scheduleId) {
    return await db.query.motorSchedules.findFirst({
        where: and(eq(motorSchedules.schedule_id, scheduleId), inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]), ne(motorSchedules.status, "ARCHIVED")),
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
export async function findActiveScheduleById(scheduleId) {
    return await db.query.motorSchedules.findFirst({
        where: and(eq(motorSchedules.id, scheduleId), inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES])),
    });
}
/**
 * Find all active/pending schedules for a motor (for stop-all operation).
 */
export async function findAllActiveSchedulesForMotor(motorId) {
    return await db.query.motorSchedules.findMany({
        where: and(eq(motorSchedules.motor_id, motorId), inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES])),
    });
}
// =================== SCHEDULE STATUS OPERATIONS ===================
/**
 * Batch update schedule status to CANCELLED for multiple schedule IDs.
 */
export async function cancelSchedulesByIds(scheduleIds) {
    if (scheduleIds.length === 0)
        return;
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
export async function stopScheduleById(scheduleId) {
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
export async function restartScheduleById(scheduleId) {
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
export async function findSchedulesByFilters(filters, page = 1, limit = 10) {
    const conditions = [ne(motorSchedules.status, "ARCHIVED")];
    if (filters.starter_id) {
        conditions.push(eq(motorSchedules.starter_id, filters.starter_id));
    }
    if (filters.motor_id) {
        conditions.push(eq(motorSchedules.motor_id, filters.motor_id));
    }
    if (filters.status) {
        conditions.push(eq(motorSchedules.schedule_status, filters.status));
    }
    if (filters.type) {
        conditions.push(eq(motorSchedules.schedule_type, filters.type));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const countResult = await db
        .select({ count: sql `count(*)::int` })
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
// =================== PENDING SCHEDULES FOR DEVICE SYNC ===================
/**
 * Fetch unacknowledged, active schedules where schedule_date is within the next 3 days
 * or repeat=1 (repeat schedules always need syncing).
 * Groups results by starter_id.
 */
export async function findPendingSchedulesForSync() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const threeDaysStr = threeDaysLater.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];
    return await db.query.motorSchedules.findMany({
        where: and(eq(motorSchedules.acknowledgement, 0), eq(motorSchedules.enabled, true), ne(motorSchedules.status, "ARCHIVED"), inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]), sql `(
        ${motorSchedules.repeat} = 1
        OR (${motorSchedules.schedule_start_date} >= ${todayStr} AND ${motorSchedules.schedule_start_date} <= ${threeDaysStr})
        OR (${motorSchedules.schedule_start_date} = ${yesterdayStr} AND ${motorSchedules.start_time} > ${motorSchedules.end_time})
      )`),
        columns: {
            id: true,
            starter_id: true,
            schedule_id: true,
            schedule_type: true,
            start_time: true,
            end_time: true,
            runtime_minutes: true,
            cycle_on_minutes: true,
            cycle_off_minutes: true,
            repeat: true,
            days_of_week: true,
            bit_wise_days: true,
            power_loss_recovery: true,
            enabled: true,
        },
        orderBy: (ms, { asc }) => [asc(ms.starter_id), asc(ms.start_time)],
    });
}
