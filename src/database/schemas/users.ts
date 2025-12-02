import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { statusEnum, userTypeEnum } from "../../constants/enum-types.js";
import { userActivityLogs } from "./user-activity-logs.js";
import { fields } from "./fields.js";


export const users = pgTable("users", {
    id: serial("id").primaryKey().notNull(),

    full_name: varchar("full_name").notNull(),
    email: varchar("email").notNull(),
    phone: varchar("phone").notNull(),

    user_type: userTypeEnum().default("USER"),

    password: varchar("password"),
    address: varchar("address"),
    status: statusEnum().default("ACTIVE"),

    created_by: integer("created_by"),
    user_verified: boolean("user_verified").default(false),

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
    index("full_name_idx").on(table.full_name),
    index("user_type_idx").on(table.user_type),
    index("user_status_idx").on(table.status),
    uniqueIndex("unique_mail_idx").on(table.email),
    uniqueIndex("unique_phone_idx").on(table.phone),
    uniqueIndex("valid_user").on(table.email, table.phone).where(sql`${table.status} != 'ARCHIVED'`),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UsersTable = typeof users;

import { locations } from "./locations.js";

export const userRelations = relations(users, ({ many }) => ({
    ownedLocations: many(locations, { relationName: "ownedLocations" }),
    createdLocations: many(locations, { relationName: "createdLocations" }),
    userActivities: many(userActivityLogs),
    fields: many(fields),
}));