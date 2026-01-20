import { desc, relations, sql } from "drizzle-orm";
import { index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";
import { users } from "./users.js";

export const alertsFaults = pgTable("alerts_faults", {

  id: serial("id").primaryKey().notNull(),
  starter_id: integer("starter_id").references(() => starterBoxes.id),
  motor_id: integer("motor_id").references(() => motors.id),
  alert_code: integer("alert_code"),
  alert_description: varchar("alert_description"),

  fault_code: integer("fault_code"),
  fault_description: varchar("fault_description"),

  timestamp: timestamp("timestamp"),
  user_id: integer("user_id").references(() => users.id),

  created_at: timestamp("created_at").notNull().defaultNow(),

}, table => [
  index("alerts_faults_starter_motor_time_desc_idx").on(table.starter_id, table.motor_id, desc(table.timestamp)),

  index("alerts_faults_fault_filter_idx").on(table.fault_code, table.fault_description)
    .where(sql`
      ${table.fault_code} IS NOT NULL
      AND ${table.fault_code} <> 0
      AND ${table.fault_description} IS NOT NULL
      AND ${table.fault_description} NOT IN ('Unknown Fault', 'No Fault')
    `),

  index("alerts_faults_alert_filter_idx").on(table.alert_code, table.alert_description)
    .where(sql`
      ${table.alert_code} IS NOT NULL
      AND ${table.alert_code} <> 0
      AND ${table.alert_description} IS NOT NULL
      AND ${table.alert_description} NOT IN ('Unknown Alert', 'No Alert')
    `),
]);


export type AlertsFaults = typeof alertsFaults.$inferSelect;;
export type NewAlertsFaults = typeof alertsFaults.$inferInsert;
export type AlertsFaultsTable = typeof alertsFaults;

export const alertsFaultsRelations = relations(alertsFaults, ({ one }) => ({

  motor: one(motors, {
    fields: [alertsFaults.motor_id],
    references: [motors.id],
  }),

  user: one(users, {
    fields: [alertsFaults.user_id],
    references: [users.id],
  }),

  starter: one(starterBoxes, {
    fields: [alertsFaults.starter_id],
    references: [starterBoxes.id],
  }),

}));
