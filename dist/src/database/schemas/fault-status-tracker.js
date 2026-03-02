import { relations, sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";
import { users } from "./users.js";
export const faultTrackerStatusEnum = pgEnum("fault_tracker_status", ["DETECTED", "ACTIVE", "CLEARED"]);
export const faultTrackerTypeEnum = pgEnum("fault_tracker_type", ["FAULT", "ALERT"]);
export const faultStatusTracker = pgTable("fault_status_tracker", {
    id: serial("id").primaryKey(),
    motor_id: integer("motor_id").references(() => motors.id),
    starter_id: integer("starter_id").references(() => starterBoxes.id),
    user_id: integer("user_id").references(() => users.id),
    fault_code: integer("fault_code").notNull(),
    fault_description: varchar("fault_description"),
    type: faultTrackerTypeEnum().notNull(),
    status: faultTrackerStatusEnum().notNull().default("DETECTED"),
    first_detected_at: timestamp("first_detected_at").notNull(),
    notified_at: timestamp("notified_at"), // when first notification sent (after 2min debounce)
    last_notified_at: timestamp("last_notified_at"), // for 30min repeat tracking
    cleared_at: timestamp("cleared_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("fst_motor_type_status_idx").on(table.motor_id, table.type, table.status),
    // Prevent duplicate active/detected records for the same motor + fault bit
    uniqueIndex("fst_active_fault_unique")
        .on(table.motor_id, table.type, table.fault_code)
        .where(sql `${table.status} IN ('DETECTED', 'ACTIVE')`),
]);
export const faultStatusTrackerRelations = relations(faultStatusTracker, ({ one }) => ({
    motor: one(motors, { fields: [faultStatusTracker.motor_id], references: [motors.id] }),
    starter: one(starterBoxes, { fields: [faultStatusTracker.starter_id], references: [starterBoxes.id] }),
    user: one(users, { fields: [faultStatusTracker.user_id], references: [users.id] }),
}));
