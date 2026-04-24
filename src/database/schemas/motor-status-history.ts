import { desc, relations } from "drizzle-orm";
import { index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";

export const motorStatusHistory = pgTable("motor_status_history", {
  id: serial("id").primaryKey().notNull(),
  starter_id: integer("starter_id").references(() => starterBoxes.id).notNull(),
  motor_id: integer("motor_id").references(() => motors.id).notNull(),
  status: varchar("status").notNull(),
  time_stamp: timestamp("time_stamp").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
}, table => [
  index("motor_status_history_starter_motor_time_desc_idx").on(table.starter_id, table.motor_id, desc(table.time_stamp)),
]);

export type MotorStatusHistory = typeof motorStatusHistory.$inferSelect;
export type NewMotorStatusHistory = typeof motorStatusHistory.$inferInsert;
export type MotorStatusHistoryTable = typeof motorStatusHistory;

export const motorStatusHistoryRelations = relations(motorStatusHistory, ({ one }) => ({
  starter: one(starterBoxes, {
    fields: [motorStatusHistory.starter_id],
    references: [starterBoxes.id],
  }),
  motor: one(motors, {
    fields: [motorStatusHistory.motor_id],
    references: [motors.id],
  }),
}));
