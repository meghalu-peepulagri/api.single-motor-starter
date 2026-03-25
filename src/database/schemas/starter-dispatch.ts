import { relations, sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { starterBoxes } from "./starter-boxes.js";
import { users } from "./users.js";

export const paymentStatusEnum = pgEnum("payment_status", ["RECEIVED", "PENDING", "PARTIAL", "CANCELLED"]);

export const starterDispatch = pgTable("starter_dispatch", {
  // System fields
  id: serial("id").primaryKey(),
  starter_id: integer("starter_id").notNull().references(() => starterBoxes.id),

  // Device details (snapshot at dispatch time)
  part_no: varchar("part_no"),
  box_serial_no: varchar("box_serial_no"),
  pcb_number: varchar("pcb_number"),
  warranty_end_date: varchar("warranty_end_date"),
  sim_no: varchar("sim_no"),
  sim_recharge_end_date: varchar("sim_recharge_end_date"),
  production_date: varchar("production_date"),
  software_version: varchar("software_version"),
  hardware_version: varchar("hardware_version"),

  // Dispatch / Customer details
  dispatch_date: varchar("dispatch_date"),
  customer_name: varchar("customer_name").notNull(),
  contact_number: varchar("contact_number"),
  address: varchar("address"),
  location: varchar("location"),
  product_name: varchar("product_name"),
  qty: integer("qty").notNull().default(1),
  remarks: varchar("remarks"),

  // Payment & Invoice
  mode_of_dispatch: varchar("mode_of_dispatch"),
  tracking_details: varchar("tracking_details"),
  mode_of_payment: varchar("mode_of_payment"),
  payment_status: paymentStatusEnum().notNull().default("PENDING"),
  invoice_no: varchar("invoice_no"),
  invoice_date: varchar("invoice_date"),

  // Audit fields
  status: statusEnum().notNull().default("ACTIVE"),
  created_by: integer("created_by").notNull().references(() => users.id),
  updated_by: integer("updated_by").references(() => users.id),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("starter_dispatch_id_idx").on(table.id),
  index("starter_dispatch_starter_id_idx").on(table.starter_id),
  index("starter_dispatch_status_idx").on(table.status),
  index("starter_dispatch_created_by_idx").on(table.created_by),
]);

export type StarterDispatch = typeof starterDispatch.$inferSelect;
export type NewStarterDispatch = typeof starterDispatch.$inferInsert;
export type StarterDispatchTable = typeof starterDispatch;

export const starterDispatchRelations = relations(starterDispatch, ({ one }) => ({
  starter: one(starterBoxes, {
    fields: [starterDispatch.starter_id],
    references: [starterBoxes.id],
  }),
  createdBy: one(users, {
    fields: [starterDispatch.created_by],
    references: [users.id],
  }),
  updatedBy: one(users, {
    fields: [starterDispatch.updated_by],
    references: [users.id],
  }),
}));
