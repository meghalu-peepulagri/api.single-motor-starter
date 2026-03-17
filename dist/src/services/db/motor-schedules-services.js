import { and, eq, gte, inArray, lte, ne, SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";
import { dateToYYMMDD } from "../../helpers/motor-schedule-payload-helper.js";
const ACTIVE_STATUSES = ["RUNNING", "PENDING", "SCHEDULED", "WAITING_NEXT_CYCLE"];
// =================== AUTO-INCREMENT SCHEDULE ID PER MOTOR ===================
/**
 * Get the next schedule_id for a given motor.
 * First tries to reuse the lowest schedule_id from ARCHIVED/DELETED schedules.
 * If no reusable ID found, returns max(schedule_id) + 1, or 1 if no schedules exist.
 */
export async function getNextScheduleIdForMotor(motorId) {
    // Find the lowest schedule_id that is ARCHIVED (status) or DELETED (schedule_status)
    const reusable = await db
        .select({ scheduleId: motorSchedules.schedule_id })
        .from(motorSchedules)
        .where(and(eq(motorSchedules.motor_id, motorId), sql `(${motorSchedules.status} = 'ARCHIVED' OR ${motorSchedules.schedule_status} IN ('DELETED', 'CANCELLED'))`))
        .orderBy(motorSchedules.schedule_id)
        .limit(1);
    if (reusable.length > 0) {
        return reusable[0].scheduleId;
    }
    // No reusable ID found — fallback to max + 1
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
 * Batch stop schedules by IDs (mark as STOPPED + manually_stopped).
 */
export async function cancelSchedulesByIds(scheduleIds) {
    if (scheduleIds.length === 0)
        return;
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
export async function stopScheduleById(scheduleId) {
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
export async function restartScheduleById(scheduleId) {
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
export async function getMaxEndDate(motorId, starterId) {
    const result = await db
        .select({ maxEndDate: sql `MAX(${motorSchedules.schedule_end_date})` })
        .from(motorSchedules)
        .where(and(eq(motorSchedules.motor_id, motorId), eq(motorSchedules.starter_id, starterId), ne(motorSchedules.status, "ARCHIVED")));
    return result[0]?.maxEndDate ?? null;
}
// =================== LIST WITH FILTERS ===================
/**
 * Find schedules with filters and pagination.
 */
export async function findSchedulesByFilters(filters, page = 1, limit = 10) {
    const conditions = [ne(motorSchedules.status, "ARCHIVED")];
    if (filters.starter_id) {
        conditions.push(eq(motorSchedules.starter_id, filters.starter_id));
    }
    if (filters.motor_id) {
        conditions.push(eq(motorSchedules.motor_id, filters.motor_id));
    }
    if (filters.schedule_status) {
        conditions.push(eq(motorSchedules.schedule_status, filters.schedule_status));
    }
    if (filters.type) {
        conditions.push(eq(motorSchedules.schedule_type, filters.type));
    }
    if (filters.schedule_start_date) {
        // Find schedules whose date range contains the given start date:
        // schedule_start_date <= filter_date AND schedule_end_date >= filter_date
        conditions.push(lte(motorSchedules.schedule_start_date, filters.schedule_start_date));
        conditions.push(gte(motorSchedules.schedule_end_date, filters.schedule_start_date));
    }
    else if (filters.schedule_end_date) {
        conditions.push(lte(motorSchedules.schedule_start_date, filters.schedule_end_date));
    }
    if (filters.repeat !== undefined) {
        conditions.push(eq(motorSchedules.repeat, filters.repeat));
    }
    if (filters.enabled !== undefined) {
        conditions.push(eq(motorSchedules.enabled, filters.enabled));
    }
    if (filters.day_of_week !== undefined) {
        conditions.push(sql `${motorSchedules.days_of_week} @> ARRAY[${filters.day_of_week}]::int[]`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult, runningCountResult] = await Promise.all([
        db
            .select({ count: sql `count(*)::int` })
            .from(motorSchedules)
            .where(whereClause),
        db
            .select({ count: sql `count(*)::int` })
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
    const yesterdayNum = dateToYYMMDD(yesterday);
    const threeDaysNum = dateToYYMMDD(threeDaysLater);
    const todayNum = dateToYYMMDD(today);
    return await db.query.motorSchedules.findMany({
        where: and(eq(motorSchedules.acknowledgement, 0), eq(motorSchedules.enabled, true), ne(motorSchedules.status, "ARCHIVED"), inArray(motorSchedules.schedule_status, [...ACTIVE_STATUSES]), sql `(
        ${motorSchedules.repeat} = 1
        OR (${motorSchedules.schedule_start_date} >= ${todayNum} AND ${motorSchedules.schedule_start_date} <= ${threeDaysNum})
        OR (${motorSchedules.schedule_start_date} = ${yesterdayNum} AND ${motorSchedules.start_time} > ${motorSchedules.end_time})
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
// =================== BATCH STATUS UPDATE FOR SYNC ===================
/**
 * Batch update schedule statuses grouped by newStatus.
 * Max 3 queries (RUNNING, COMPLETED, WAITING_NEXT_CYCLE) instead of N individual updates.
 */
export async function batchUpdateScheduleStatuses(groups) {
    const results = [];
    for (const group of groups) {
        if (group.ids.length === 0)
            continue;
        const setData = {
            schedule_status: group.status,
            updated_at: new Date(),
        };
        if (group.last_started_at)
            setData.last_started_at = group.last_started_at;
        if (group.last_stopped_at)
            setData.last_stopped_at = group.last_stopped_at;
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
        where: and(eq(motorSchedules.enabled, true), ne(motorSchedules.status, "ARCHIVED"), inArray(motorSchedules.schedule_status, ["SCHEDULED", "RUNNING", "WAITING_NEXT_CYCLE"])),
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
