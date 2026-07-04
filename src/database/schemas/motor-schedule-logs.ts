import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { motorSchedules } from "./motor-schedules.js";

export const scheduleLogEventEnum = pgEnum("schedule_log_event", [
  "CREATED",
  "SENT_TO_DEVICE",
  "DEVICE_ACK_CREATE",
  "RESENT",
  "STOP_SENT",
  "DEVICE_ACK_STOP",
  "RESTART_SENT",
  "DEVICE_ACK_RESTART",
  "DELETE_SENT",
  "DEVICE_ACK_DELETE",
  "STATUS_CHANGED",
  "LIVE_DATA_RECEIVED",
]);

export const motorScheduleLogs = pgTable("motor_schedule_logs", {
  id: serial("id").primaryKey().notNull(),
  schedule_id: integer("schedule_id").notNull().references(() => motorSchedules.id),
  event_type: scheduleLogEventEnum().notNull(),
  actor_type: varchar("actor_type"),
  actor_id: integer("actor_id"),
  old_status: varchar("old_status"),
  new_status: varchar("new_status"),
  details: jsonb("details").$type<Record<string, any>>(),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (table: any) => [
  index("msl_schedule_id_idx").on(table.schedule_id),
  index("msl_created_at_idx").on(table.created_at),
]);

export type MotorScheduleLog = typeof motorScheduleLogs.$inferSelect;
export type NewMotorScheduleLog = typeof motorScheduleLogs.$inferInsert;
export type MotorScheduleLogsTable = typeof motorScheduleLogs;

export const motorScheduleLogRelations = relations(motorScheduleLogs, ({ one }) => ({
  schedule: one(motorSchedules, {
    fields: [motorScheduleLogs.schedule_id],
    references: [motorSchedules.id],
  }),
}));
