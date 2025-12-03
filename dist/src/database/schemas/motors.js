import { relations, sql } from "drizzle-orm";
import { index, integer, numeric, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { fields } from "./fields.js";
import { users } from "./users.js";
export const modeEnum = pgEnum("mode_enum", ["LOCAL+MANUAL", "REMOTE+MANUAL", "LOCAL+AUTO", "REMOTE+AUTO"]);
export const motors = pgTable("motors", {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    hp: numeric("hp", { precision: 10, scale: 2 }).notNull(),
    field_id: integer("field_id").references(() => fields.id),
    state: integer("state").notNull().default(0),
    mode: modeEnum().notNull().default("LOCAL+AUTO"),
    created_by: integer("created_by").notNull().references(() => users.id),
    status: statusEnum().default("ACTIVE"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, (table) => [
    index("motor_user_id_idx").on(table.created_by),
    index("motor_idx").on(table.id),
    uniqueIndex("unique_motor_per_field").on(sql `lower(${table.name})`, table.field_id).where(sql `${table.status} != 'ARCHIVED'`),
]);
export const motorRelations = relations(motors, ({ one, many }) => ({
    field: one(fields, {
        fields: [motors.field_id],
        references: [fields.id]
    }),
    created_by_user: one(users, {
        fields: [motors.created_by],
        references: [users.id]
    }),
}));
