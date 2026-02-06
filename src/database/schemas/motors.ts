import { relations, sql } from "drizzle-orm";
import { index, integer, numeric, pgEnum, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { locations } from "./locations.js";
import { starterBoxes } from "./starter-boxes.js";
import { starterBoxParameters } from "./starter-parameters.js";
import { users } from "./users.js";
export const testRunStatusEnum = pgEnum("test_run_status", ["IN_TEST", "COMPLETED", "FAILED"]);
export const modeEnum = pgEnum("mode_enum", ["MANUAL", "AUTO"]);
// 1 = MANUAL, 0 = AUTO

export const motors = pgTable("motors", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  alias_name: varchar("alias_name"),
  hp: numeric("hp", { precision: 10, scale: 2 }).notNull(),
  location_id: integer("location_id").references(() => locations.id),
  state: integer("state").notNull().default(0),
  mode: modeEnum().default("AUTO").notNull(),
  created_by: integer("created_by").references(() => users.id),
  starter_id: integer("starter_id").references(() => starterBoxes.id),
  status: statusEnum().default("ACTIVE"),
  test_run_status: testRunStatusEnum().default("IN_TEST"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  assigned_at: timestamp("assigned_at"),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, (table: any) => [
  index("motor_user_id_idx").on(table.created_by),
  index("motor_idx").on(table.id),
  index("motor_alias_name_idx").on(table.alias_name),
  index("motor_test_run_status_idx").on(table.test_run_status),
]);

export type Motor = typeof motors.$inferSelect;
export type NewMotor = typeof motors.$inferInsert;
export type MotorsTable = typeof motors;

export const motorRelations = relations(motors, ({ one, many }) => ({

  created_by_user: one(users, {
    fields: [motors.created_by],
    references: [users.id]
  }),

  starter: one(starterBoxes, {
    fields: [motors.starter_id],
    references: [starterBoxes.id],
  }),

  location: one(locations, {
    fields: [motors.location_id],
    references: [locations.id],
  }),

  starterParameters: many(starterBoxParameters, {
    relationName: "motorParameters",
  }),
}));