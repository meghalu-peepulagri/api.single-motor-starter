import { desc, relations } from "drizzle-orm";
import { index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { motors } from "./motors.js";
import { starterBoxes } from "./starter-boxes.js";
export const deviceStatusHistory = pgTable("device_status_history", {
    id: serial("id").primaryKey().notNull(),
    starter_id: integer("starter_id").references(() => starterBoxes.id).notNull(),
    motor_id: integer("motor_id").references(() => motors.id),
    status: varchar("status").notNull(),
    time_stamp: timestamp("time_stamp").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
}, table => [
    index("device_status_history_starter_motor_time_desc_idx").on(table.starter_id, table.motor_id, desc(table.time_stamp)),
]);
export const deviceStatusHistoryRelations = relations(deviceStatusHistory, ({ one }) => ({
    starter: one(starterBoxes, {
        fields: [deviceStatusHistory.starter_id],
        references: [starterBoxes.id],
    }),
    motor: one(motors, {
        fields: [deviceStatusHistory.motor_id],
        references: [motors.id],
    }),
}));
