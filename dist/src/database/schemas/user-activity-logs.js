import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { starterBoxes } from "./starter-boxes.js";
import { users } from "./users.js";
export const userActivityLogs = pgTable("user_activity_logs", {
    id: serial("id").primaryKey(),
    user_id: integer("user_id").references(() => users.id), // The user this log belongs to (optional)
    performed_by: integer("performed_by").notNull().references(() => users.id),
    action: varchar("action").notNull(), // e.g., 'EDITED', 'RENAMED', 'STATUS_CHANGE'
    entity_type: varchar("entity_type").notNull(), // e.g., 'STARTER', 'MOTOR', 'SETTING'
    entity_id: integer("entity_id"), // ID of the starter or motor
    device_id: integer("device_id").references(() => starterBoxes.id), // ID of the device
    old_data: text("old_data"),
    new_data: text("new_data"),
    message: text("message"), // description
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("user_id_logs_idx").on(table.user_id),
    index("entity_idx").on(table.entity_type, table.entity_id),
]);
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
