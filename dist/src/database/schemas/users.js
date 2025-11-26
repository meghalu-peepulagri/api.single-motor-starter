import { relations, sql } from "drizzle-orm";
import { pgTable, serial, timestamp, uniqueIndex, varchar, integer, index } from "drizzle-orm/pg-core";
import { statusEnum, userTypeEnum } from "../../constants/enum-types.js";
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
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("full_name_idx").on(table.full_name),
    index("user_type_idx").on(table.user_type),
    index("user_status_idx").on(table.status),
    uniqueIndex("unique_mail_idx").on(table.email),
    uniqueIndex("unique_phone_idx").on(table.phone),
    uniqueIndex("valid_user").on(table.email, table.phone).where(sql `${table.status} != 'ARCHIVED'`),
]);
export const userRelations = relations(users, ({ many }) => ({
    locations: many(users),
    userActivities: many(users),
}));
