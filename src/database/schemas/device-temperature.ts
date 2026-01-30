import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, real, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";

export const deviceTemperature = pgTable("device_temperature", {
  id: serial("id").primaryKey().notNull(),
  device_id: integer("device_id").notNull().references(() => starterBoxes.id),
  motor_id: integer("motor_id").notNull().references(() => motors.id),
  temperature: real("temperature").notNull(),
  time_stamp: varchar("time_stamp").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("device_temperature_device_id_idx").on(table.device_id),
]);

export type DeviceTemperature = typeof deviceTemperature.$inferSelect;
export type NewDeviceTemperature = typeof deviceTemperature.$inferInsert;
export type DeviceTemperatureTable = typeof deviceTemperature;

export const deviceTemperatureRelations = relations(deviceTemperature, ({ one }) => ({
  device: one(starterBoxes, {
    fields: [deviceTemperature.device_id],
    references: [starterBoxes.id],
  }),

  motor: one(motors, {
    fields: [deviceTemperature.motor_id],
    references: [motors.id],
  }),
}));
