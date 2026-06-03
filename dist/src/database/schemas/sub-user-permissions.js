import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { starterBoxes } from "./starter-boxes.js";
import { motors } from "./motors.js";
export const subUserPermissions = pgTable("sub_user_permissions", {
    id: serial("id").primaryKey(),
    sub_user_id: integer("sub_user_id").notNull().references(() => users.id),
    parent_id: integer("parent_id").notNull().references(() => users.id),
    permissions: jsonb("permissions").$type().default(sql `'[]'::jsonb`),
    starter_id: integer("starter_id").references(() => starterBoxes.id),
    motor_id: integer("motor_id").references(() => motors.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
}, table => [
    uniqueIndex("uniq_sub_user_perm").on(table.sub_user_id, table.parent_id),
]);
