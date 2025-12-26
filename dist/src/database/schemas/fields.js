import { sql } from "drizzle-orm";
import { index, integer, numeric, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { locations } from "./locations.js";
import { users } from "./users.js";
export const fields = pgTable("fields", {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    created_by: integer("created_by").notNull().references(() => users.id),
    location_id: integer("location_id").notNull().references(() => locations.id),
    acres: numeric("acres", { precision: 10, scale: 2 }),
    status: statusEnum().default("ACTIVE"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("filed_user_id_idx").on(table.created_by),
    index("location_id_idx").on(table.location_id),
    index("field_status_idx").on(table.status),
    uniqueIndex("unique_field_per_user").on(table.created_by, table.id).where(sql `${table.status} != 'ARCHIVED'`),
    uniqueIndex("unique_field_per_user_location").on(sql `lower(${table.name})`, table.location_id, table.created_by).where(sql `${table.status} != 'ARCHIVED'`),
]);
