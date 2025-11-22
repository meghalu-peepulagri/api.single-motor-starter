import { sql } from "drizzle-orm";
import { pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
export const statusEnum = pgEnum("status_enum", ["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const userTypeEnum = pgEnum("user_type", ["ADMIN", "USER"]);

export const users = pgTable("users", {
    id: serial("id").primaryKey().notNull(),

    full_name: varchar("full_name").notNull(),
    email: varchar("email"),
    phone: varchar("phone").notNull(),

    user_type: userTypeEnum().default("USER"),

    password: varchar("password"),
    address: varchar("address"),
    status: statusEnum().default("ACTIVE"),

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
    uniqueIndex("emailIdx").on(table.email),
    uniqueIndex("phoneIdx").on(table.phone),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UsersTable = typeof users;
