import { sql, relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { statusEnum } from "../../constants/enum-types.js";
import { gateways } from "./gateways.js";
export const deviceStatusEnum = pgEnum("device_status", ["ASSIGNED", "DEPLOYED", "READY ", "TEST"]);


export const starterBoxes = pgTable("starter_boxes", {

  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  alias_name: varchar("alias_name"),
  mac_address: varchar("mac_address").notNull(),
  serial_number: varchar("serial_number").notNull(),
  pcb_number: varchar("pcb_number").notNull(),
  starter_number: varchar("starter_number").notNull(),
  status: statusEnum().notNull().default("ACTIVE"),

  user_id: integer("user_id").references(() => users.id),
  created_by: integer("created_by").references(() => users.id),

  device_status: deviceStatusEnum().notNull().default("TEST"),
  gateway_id: integer("gateway_id").references(() => gateways.id),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("starter_box_id_idx").on(table.id),
  index("starter_box_user_id_idx").on(table.user_id),
  index("starter_box_status_idx").on(table.status),
  index("starter_box_device_status_idx").on(table.device_status),

  uniqueIndex("valid_starter_box_name").on(sql`lower(${table.name})`).where(sql`${table.status} != 'ARCHIVED'`),
  uniqueIndex("validate_serial_number").on(sql`lower(${table.serial_number})`).where(sql`${table.status} != 'ARCHIVED'`),
  uniqueIndex("validate_mac_address").on(sql`lower(${table.mac_address})`).where(sql`${table.status} != 'ARCHIVED'`),
  uniqueIndex("validate_pcb_number").on(sql`lower(${table.pcb_number})`).where(sql`${table.status} != 'ARCHIVED'`),
  uniqueIndex("validate_starter_number").on(sql`lower(${table.starter_number})`).where(sql`${table.status} != 'ARCHIVED'`),
]);

export type StarterBox = typeof starterBoxes.$inferSelect;
export type NewStarterBox = typeof starterBoxes.$inferInsert;
export type StarterBoxTable = typeof starterBoxes;

export const starterBoxesRelations = relations(starterBoxes, ({ one }) => ({
  user: one(users, {
    fields: [starterBoxes.user_id],
    references: [users.id],
  }),

  gateway: one(gateways, {
    fields: [starterBoxes.gateway_id],
    references: [gateways.id],
  }),
}));

