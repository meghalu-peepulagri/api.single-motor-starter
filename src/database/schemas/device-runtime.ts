
import { sql } from "drizzle-orm";
import { index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.js";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";


export const deviceRunTime = pgTable("device_run_time", {
  id: serial("id").primaryKey().notNull(),

  motor_id: integer("motor_id").references(() => motors.id),
  starter_box_id: integer("starter_box_id").references(() => starterBoxes.id),
  location_id: integer("location_id").references(() => locations.id),

  start_time: timestamp("start_time").notNull(),
  end_time: timestamp("end_time"),
  duration: varchar("duration"),
  motor_state: integer("motor_state"),
  motor_mode: varchar("motor_mode"),
  power_state: integer("power_state"),
  signal_strength: integer("signal_strength"),
  time_stamp: varchar("time_stamp").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),

}, table => [
  index("deviceMotorIdxRunTime").on(table.motor_id),
  index("deviceIdxRunTime").on(table.starter_box_id),
]);
export type DeviceRunTime = typeof deviceRunTime.$inferSelect;
export type NewDeviceRunTime = typeof deviceRunTime.$inferInsert;
export type DeviceRunTimeTable = typeof deviceRunTime;
