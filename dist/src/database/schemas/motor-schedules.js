import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";
import { statusEnum } from "../../constants/enum-types.js";
import { users } from "./users.js";
export const scheduleStatusEnum = pgEnum("schedule_status", [
    "PENDING",
    "SCHEDULED",
    "RUNNING",
    "STOPPED",
    "COMPLETED",
    "PARTIAL",
    "MISSED",
    "UNDELIVERED",
    "FAILED",
    "DELETED",
    "RESTARTED",
    "WAITING_NEXT_CYCLE",
]);
export const scheduleTypeEnum = pgEnum("schedule_mode", ["TIME_BASED", "CYCLIC"]);
export const motorSchedules = pgTable("motor_schedules", {
    id: serial("id").primaryKey().notNull(),
    motor_id: integer("motor_id").notNull().references(() => motors.id),
    starter_id: integer("starter_id").references(() => starterBoxes.id),
    schedule_type: scheduleTypeEnum().default("TIME_BASED").notNull(),
    schedule_id: integer("schedule_id").notNull(),
    bit_wise_days: integer("bit_wise_days").default(0),
    schedule_start_date: integer("schedule_start_date"),
    schedule_end_date: integer("schedule_end_date"),
    days_of_week: integer("days_of_week").array().notNull().default(sql `'{}'::integer[]`),
    start_time: varchar("start_time").notNull(),
    end_time: varchar("end_time").notNull(),
    runtime_minutes: integer("runtime_minutes"),
    cycle_on_minutes: integer("cycle_on_minutes"),
    cycle_off_minutes: integer("cycle_off_minutes"),
    power_loss_recovery: boolean("power_loss_recovery").default(false).notNull(),
    power_loss_recovery_time: integer("power_loss_recovery_time").default(30),
    schedule_status: scheduleStatusEnum().default("PENDING").notNull(),
    // Create ACK tracking (legacy single-field; new multi-op tracking in motor_schedule_operations)
    acknowledgement: integer("acknowledgement").default(0),
    acknowledged_at: timestamp("acknowledged_at"),
    publish_attempts: integer("publish_attempts").default(0).notNull(),
    // Schedule lifecycle timestamps
    last_started_at: timestamp("last_started_at"),
    last_stopped_at: timestamp("last_stopped_at"),
    paused_at: timestamp("paused_at"),
    restarted_at: timestamp("restarted_at"),
    completed_at: timestamp("completed_at"),
    edited_at: timestamp("edited_at"),
    // Schedule config flags
    enabled: boolean("enabled").default(true).notNull(),
    repeat: integer("repeat").default(0).notNull(),
    priority: integer("priority").default(2).notNull(),
    accumulated_on_seconds: integer("accumulated_on_seconds").default(0),
    manually_stopped: boolean("manually_stopped").default(false),
    // Server-tracked actual execution (from device reports, last known value)
    actual_start_time: varchar("actual_start_time"),
    actual_end_time: varchar("actual_end_time"),
    actual_started_at: timestamp("actual_started_at"),
    actual_ended_at: timestamp("actual_ended_at"),
    actual_run_time: integer("actual_run_time"),
    actual_type: scheduleTypeEnum("actual_type"),
    missed_minutes: integer("missed_minutes").default(0),
    failure_at: timestamp("failure_at"),
    failure_reason: varchar("failure_reason"),
    failure_code: integer("failure_code"),
    // Device live data snapshot — overwritten every 2-min report; full history in motor_schedule_live_data + S3
    start_date_time: timestamp("start_date_time"),
    end_date_time: timestamp("end_date_time"),
    device_start_time: varchar("device_start_time"),
    device_end_time: varchar("device_end_time"),
    device_run_time: integer("device_run_time"),
    device_missed_minutes: integer("device_missed_minutes").default(0),
    device_failure_at: timestamp("device_failure_at"),
    device_failure_reason: varchar("device_failure_reason"),
    device_last_seen_at: timestamp("device_last_seen_at"),
    // Device-assigned slot ID — set at ACK time, never recycled
    device_schedule_id: integer("device_schedule_id"),
    // Ownership & soft-delete
    created_by: integer("created_by").references(() => users.id),
    deleted_by: integer("deleted_by").references(() => users.id),
    deleted_at: timestamp("deleted_at"),
    status: statusEnum().default("ACTIVE").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index("motor_schedule_motor_id_idx").on(table.motor_id),
    index("motor_schedule_starter_id_idx").on(table.starter_id),
    index("motor_schedule_status_idx").on(table.schedule_status),
    uniqueIndex("motor_schedule_unique_idx")
        .on(table.motor_id, table.schedule_id)
        .where(sql `status != 'ARCHIVED' AND schedule_status NOT IN ('COMPLETED','MISSED','PARTIAL','FAILED','DELETED')`),
]);
export const motorScheduleRelations = relations(motorSchedules, ({ one }) => ({
    motor: one(motors, {
        fields: [motorSchedules.motor_id],
        references: [motors.id],
    }),
    starter: one(starterBoxes, {
        fields: [motorSchedules.starter_id],
        references: [starterBoxes.id],
    }),
}));
