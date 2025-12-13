import { relations, sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { fields } from "./fields.js";
import { motors } from "./motors.js";
export const motorScheduleTypeEnum = pgEnum("schedule_type", ["ONE_TIME", "DAILY", "WEEKLY"]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["PENDING", "RUNNING", "SCHEDULED", "COMPLETED", "FAILED", "PAUSED", "CANCELLED", "RESCHEDULED"]);
export const motorSchedules = pgTable("motor_schedules", {
    id: serial("id").primaryKey().notNull(),
    pond_id: integer("pond_id").notNull().references(() => fields.id),
    motor_id: integer("motor_id").notNull().references(() => motors.id),
    schedule_type: motorScheduleTypeEnum().default("ONE_TIME").notNull(), // One Time,  Daily, Weekly
    schedule_date: varchar("schedule_date"), // specific date for one-time schedule
    days_of_week: integer("days_of_week").array().default(sql `'{}'::integer[]`), // days of the week (0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday)
    start_time: varchar("start_time").notNull(),
    end_time: varchar("end_time").notNull(),
    schedule_status: scheduleStatusEnum().default("PENDING").notNull(),
    acknowledgement: integer("acknowledgement").default(0), // 0 = Not Acknowledged, 1 = Acknowledged
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index("motorScheduleMotorIdx").on(table.motor_id),
    uniqueIndex("uniqueMotorSchedule").on(table.motor_id, table.schedule_type, table.start_time, table.end_time),
]);
export const motorScheduleRelations = relations(motorSchedules, ({ one, many }) => ({
    schedule: one(motors, {
        fields: [motorSchedules.motor_id],
        references: [motors.id],
    }),
}));
