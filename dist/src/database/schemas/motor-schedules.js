import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";
import { statusEnum } from "../../constants/enum-types.js";
import { users } from "./users.js";
export const scheduleStatusEnum = pgEnum("schedule_status", [
    "PENDING", // Created but not yet evaluated
    "SCHEDULED", // Waiting for start time
    "RUNNING", // Currently running
    "STOPPED", // Stopped manually (cmd=1)
    "COMPLETED", // Finished successfully
    "FAILED", // Device execution failed
    "CANCELLED", // Cancelled by user/system
    "DELETED", // Deleted (cmd=3)
    "RESTARTED", // Restarted (cmd=2)
]);
export const scheduleTypeEnum = pgEnum("schedule_mode", ["TIME_BASED", "CYCLIC"]);
export const motorSchedules = pgTable("motor_schedules", {
    id: serial("id").primaryKey().notNull(),
    motor_id: integer("motor_id").notNull().references(() => motors.id),
    starter_id: integer("starter_id").references(() => starterBoxes.id),
    schedule_type: scheduleTypeEnum().default("TIME_BASED").notNull(), // TIME_BASED, CYCLIC
    schedule_id: integer("schedule_id").notNull(), // Auto-increment per motor 
    schedule_date: varchar("schedule_date"), // Scheduled at
    days_of_week: integer("days_of_week").array().notNull().default(sql `'{}'::integer[]`), // 0=Sunday, 1=Monday ... 6=Saturday
    start_time: varchar("start_time").notNull(), // HH:mm format
    end_time: varchar("end_time").notNull(), // HH:mm format
    // Runtime quota in minutes (optional - for TIME_BASED mode)
    runtime_minutes: integer("runtime_minutes"),
    // Cyclic mode ON/OFF durations in minutes
    cycle_on_minutes: integer("cycle_on_minutes"),
    cycle_off_minutes: integer("cycle_off_minutes"),
    // Power loss recovery: track actual ON time, extend schedule to compensate
    power_loss_recovery: boolean("power_loss_recovery").default(false).notNull(),
    // Accumulated actual ON time in seconds (updated by device/MQTT layer)
    accumulated_on_seconds: integer("accumulated_on_seconds").default(0),
    // Whether this schedule was manually stopped
    manually_stopped: boolean("manually_stopped").default(false),
    // Repeat the same schedule: 0 = Repeat OFF, 1 = Repeat ON
    repeat: integer("repeat").default(0).notNull(),
    // schedule active or not (for soft delete and future use)
    enabled: boolean("enabled").default(true).notNull(),
    schedule_status: scheduleStatusEnum().default("PENDING").notNull(),
    acknowledgement: integer("acknowledgement").default(0), // 0 = Not Acknowledged, 1 = Acknowledged
    acknowledged_at: timestamp("acknowledged_at"),
    last_started_at: timestamp("last_started_at"),
    last_stopped_at: timestamp("last_stopped_at"),
    created_by: integer("created_by").references(() => users.id), // user_id of the creator
    deleted_by: integer("deleted_by").references(() => users.id), // user_id of who deleted (if applicable)
    status: statusEnum().default("ACTIVE").notNull(),
    priority: integer("priority").default(2).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index("motor_schedule_motor_id_idx").on(table.motor_id),
    index("motor_schedule_starter_id_idx").on(table.starter_id),
    index("motor_schedule_status_idx").on(table.schedule_status),
    uniqueIndex("motor_schedule_unique_idx").on(table.motor_id, table.schedule_id),
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
