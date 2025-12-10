import { relations, sql } from "drizzle-orm";
import { index, integer, numeric, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { starterBoxes } from "./starter-boxes.js";
import { users } from "./users.js";
import { starterBoxParameters } from "./starter-parameters.js";
import { locations } from "./locations.js";
export const modeEnum = pgEnum("mode_enum", ["MANUAL", "AUTO"]);
// 0 = AUTO, 1 = MANUAL

export const motors = pgTable("motors", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  hp: numeric("hp", { precision: 10, scale: 2 }).notNull(),
  location_id: integer("location_id").notNull().references(() => locations.id),
  state: integer("state").notNull().default(0),
  mode: modeEnum().default("AUTO").notNull(),
  created_by: integer("created_by").notNull().references(() => users.id),
  starter_id: integer("starter_id").references(() => starterBoxes.id),
  status: statusEnum().default("ACTIVE"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, (table: any) => [
  index("motor_user_id_idx").on(table.created_by),
  index("motor_idx").on(table.id),
  uniqueIndex("unique_motor_per_location").on(sql`lower(${table.name})`, table.location_id).where(sql`${table.status} != 'ARCHIVED'`),
]);

export type Motor = typeof motors.$inferSelect;
export type NewMotor = typeof motors.$inferInsert;
export type MotorsTable = typeof motors;

export const motorRelations = relations(motors, ({ one, many }) => ({
  // field: one(fields, {
  //   fields: [motors.field_id],
  //   references: [fields.id]
  // }),

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