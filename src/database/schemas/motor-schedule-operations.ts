import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { motorSchedules } from "./motor-schedules.js";

export const scheduleOperationEnum = pgEnum("schedule_operation", [
  "CREATE",
  "STOP",
  "RESTART",
  "DELETE",
]);

export const motorScheduleOperations = pgTable("motor_schedule_operations", {
  id: serial("id").primaryKey().notNull(),
  schedule_id: integer("schedule_id").notNull().references(() => motorSchedules.id),
  operation: scheduleOperationEnum().notNull(),
  sent_at: timestamp("sent_at"),
  ack_at: timestamp("ack_at"),
  ack_status: integer("ack_status").default(0).notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, (table: any) => [
  index("mso_schedule_id_idx").on(table.schedule_id),
  index("mso_schedule_op_idx").on(table.schedule_id, table.operation),
]);

export type MotorScheduleOperation = typeof motorScheduleOperations.$inferSelect;
export type NewMotorScheduleOperation = typeof motorScheduleOperations.$inferInsert;
export type MotorScheduleOperationTable = typeof motorScheduleOperations;

export const motorScheduleOperationRelations = relations(motorScheduleOperations, ({ one }) => ({
  schedule: one(motorSchedules, {
    fields: [motorScheduleOperations.schedule_id],
    references: [motorSchedules.id],
  }),
}));
