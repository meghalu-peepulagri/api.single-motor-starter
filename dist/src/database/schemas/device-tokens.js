import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const deviceTokenStatus = pgEnum("device_token_status", ["ACTIVE", "INACTIVE"]);
export const deviceTokens = pgTable("device_tokens", {
    id: serial("id").primaryKey(),
    device_token: varchar("device_token").notNull(),
    user_id: integer("user_id").references(() => users.id),
    status: deviceTokenStatus().default("ACTIVE"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("device_token_idx").on(table.device_token),
    uniqueIndex("valid_device_token_idx").on(table.device_token, table.user_id).where(sql `${table.status} <> 'INACTIVE'`),
]);
