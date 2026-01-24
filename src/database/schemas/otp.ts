import { sql } from "drizzle-orm";
import { boolean, index, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const otps = pgTable("otps", {
  id: serial("id").primaryKey().notNull(),
  phone: varchar("phone").notNull(),
  action: varchar("action").notNull(),
  is_verified: boolean("is_verified").default(false).notNull(),
  otp: varchar("otp").notNull(),
  expires_at: timestamp("expires_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("otp_phone_idx").on(table.phone),
]);

export type Otp = typeof otps.$inferSelect;
export type NewOtp = typeof otps.$inferInsert;
export type OtpTable = typeof otps;
