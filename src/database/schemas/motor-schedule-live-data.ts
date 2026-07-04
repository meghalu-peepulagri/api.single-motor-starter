import { relations } from "drizzle-orm";
import { integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { motorSchedules } from "./motor-schedules.js";
import { starterBoxes } from "./starter-boxes.js";

export const motorScheduleLiveData = pgTable("motor_schedule_live_data", {
  id: serial("id").primaryKey().notNull(),
  schedule_id: integer("schedule_id").notNull().unique().references(() => motorSchedules.id),
  motor_id: integer("motor_id").notNull().references(() => motors.id),
  starter_id: integer("starter_id").references(() => starterBoxes.id),
  device_start_time: varchar("device_start_time"),
  device_end_time: varchar("device_end_time"),
  device_run_time: integer("device_run_time"),
  device_missed_minutes: integer("device_missed_minutes").default(0),
  failure_reason: varchar("failure_reason"),
  failure_code: integer("failure_code"),
  received_at: timestamp("received_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export type MotorScheduleLiveData = typeof motorScheduleLiveData.$inferSelect;
export type NewMotorScheduleLiveData = typeof motorScheduleLiveData.$inferInsert;
export type MotorScheduleLiveDataTable = typeof motorScheduleLiveData;

export const motorScheduleLiveDataRelations = relations(motorScheduleLiveData, ({ one }) => ({
  schedule: one(motorSchedules, {
    fields: [motorScheduleLiveData.schedule_id],
    references: [motorSchedules.id],
  }),
  motor: one(motors, {
    fields: [motorScheduleLiveData.motor_id],
    references: [motors.id],
  }),
  starter: one(starterBoxes, {
    fields: [motorScheduleLiveData.starter_id],
    references: [starterBoxes.id],
  }),
}));
