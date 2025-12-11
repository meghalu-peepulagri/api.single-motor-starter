import { boolean, index, integer, jsonb, pgTable, real, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { starterBoxes } from "./starter-boxes.js";
import { relations, sql } from "drizzle-orm";
import { gateways } from "./gateways.js";
import { users } from "./users.js";
import { motors } from "./motors.js";

export const starterBoxParameters = pgTable("starter_parameters", {
  id: serial("id").primaryKey(),

  payload_version: varchar("payload_version").notNull(),
  packet_number: integer("packet_number").notNull().default(0),

  // Line voltage
  line_voltage_r: real("line_voltage_r").notNull().default(0),
  line_voltage_y: real("line_voltage_s").notNull().default(0),
  line_voltage_b: real("line_voltage_b").notNull().default(0),
  avg_voltage: real("avg_voltage").notNull().default(0),

  // Current
  current_r: real("current_r").notNull().default(0),
  current_y: real("current_s").notNull().default(0),
  current_b: real("current_b").notNull().default(0),
  avg_current: real("avg_current").notNull().default(0),

  // Power
  power_present: integer("power_factor").notNull(),

  // Motor values
  motor_mode: integer("motor_mode").notNull(),
  mode_description: varchar("mode_description").notNull(),
  motor_state: integer("motor_state").notNull(),
  motor_description: varchar("motor_description").notNull(),

  // Faults & alerts 
  alert_code: integer("alert").notNull(),
  alert_description: varchar("alert_description").notNull(),
  fault: integer("fault").notNull(),
  fault_description: varchar("fault_description").notNull(),

  last_on_code: integer("last_on_code").notNull(),
  last_on_description: varchar("last_on_description").notNull(),
  last_off_code: integer("last_off_code").notNull(),
  last_off_description: varchar("last_off_description").notNull(),

  // time stamp
  time_stamp: varchar("time_stamp").notNull(),

  // References
  starter_id: integer("starter_id").notNull().references(() => starterBoxes.id),
  motor_id: integer("motor_id").notNull().references(() => motors.id),
  gateway_id: integer("gateway_id").references(() => gateways.id),
  user_id: integer("user_id").notNull().references(() => users.id),
  payload_valid: boolean("payload_valid").notNull().default(false),
  payload_errors: jsonb('payload_errors').notNull().default(sql`'[]'::jsonb`),
  group_id: varchar("group_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("starter_params_starter_id_idx").on(table.starter_id),
]);

export type StarterBoxParameters = typeof starterBoxParameters.$inferSelect;
export type NewStarterBoxParameters = typeof starterBoxParameters.$inferInsert;
export type StarterBoxParametersTable = typeof starterBoxParameters;

export const starterBoxParametersRelations = relations(starterBoxParameters, ({ one }) => ({
  starter: one(starterBoxes, {
    fields: [starterBoxParameters.starter_id],
    references: [starterBoxes.id],
  }),

  motor: one(motors, {
    fields: [starterBoxParameters.motor_id],
    references: [motors.id],
    relationName: "motorParameters",
  }),

  gateway: one(gateways, {
    fields: [starterBoxParameters.gateway_id],
    references: [gateways.id],
  }),
  user: one(users, {
    fields: [starterBoxParameters.user_id],
    references: [users.id],
  })
}));