

import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),

  field_name: varchar("field_name"),
  user_id: integer("user_id").notNull().references(() => users.id),
  action: varchar("action").notNull(),
  performed_by: integer("performed_by").notNull().references(() => users.id),

  old_data: varchar("old_data"),
  new_data: varchar("new_data"),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().default(sql`CURRENT_TIMESTAMP`),
},
  table => [
    index("user_id_logs_idx").on(table.user_id),
  ]);

export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type NewUserActivityLog = typeof userActivityLogs.$inferInsert;
export type UserActivityLogsTable = typeof userActivityLogs;

export const userActivityLogRelations = relations(userActivityLogs, ({ one }) => ({
  user: one(users, {
    fields: [userActivityLogs.user_id],
    references: [users.id],
  }),

  performedBy: one(users, {
    fields: [userActivityLogs.performed_by],
    references: [users.id],
  }),
}));

