import { relations, sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, real, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { gateways } from "./gateways.js";
import { locations } from "./locations.js";
import { motors } from "./motors.js";
import { starterBoxParameters } from "./starter-parameters.js";
import { users } from "./users.js";
export const deviceStatusEnum = pgEnum("device_status", ["ASSIGNED", "DEPLOYED", "READY", "TEST"]);
export const starterType = pgEnum("starter_type", ["SINGLE_STARTER", "MULTI_STARTER"]);
export const starterBoxes = pgTable("starter_boxes", {
    id: serial("id").primaryKey(),
    name: varchar("name"),
    alias_name: varchar("alias_name"),
    mac_address: varchar("mac_address"),
    pcb_number: varchar("pcb_number"),
    starter_number: varchar("starter_number").notNull(),
    status: statusEnum().notNull().default("ACTIVE"),
    power: integer("power").notNull().default(0),
    user_id: integer("user_id").references(() => users.id),
    created_by: integer("created_by").notNull().references(() => users.id),
    device_status: deviceStatusEnum().notNull().default("READY"),
    gateway_id: integer("gateway_id").references(() => gateways.id),
    location_id: integer("location_id").references(() => locations.id),
    signal_quality: integer("signal_quality").notNull().default(0),
    network_type: varchar("network_type"),
    starter_type: starterType().notNull().default("SINGLE_STARTER"),
    hardware_version: varchar("hardware_version"),
    temperature: real("temperature").default(0),
    limit: real("limit"),
    deployed_at: timestamp("deployed_at"),
    device_allocation: varchar("device_allocation").default("false"),
    synced_settings_status: varchar("synced_settings_status").default("false"),
    device_mobile_number: varchar("device_mobile_number"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    assigned_at: timestamp("assigned_at"),
    updated_at: timestamp("updated_at").notNull().defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("starter_box_id_idx").on(table.id),
    index("starter_box_user_id_idx").on(table.user_id),
    index("starter_box_status_idx").on(table.status),
    index("starter_box_device_status_idx").on(table.device_status),
    index("starter_box_pcb_number_idx").on(table.pcb_number),
    index("starter_box_mac_address_idx").on(table.mac_address),
    index("starter_box_starter_number_idx").on(table.starter_number),
    index("starter_box_location_id_idx").on(table.location_id),
    index("starter_box_power_idx").on(table.power),
    uniqueIndex("valid_starter_box_name").on(sql `lower(${table.name})`).where(sql `${table.status} != 'ARCHIVED'`),
    uniqueIndex("validate_mac_address").on(sql `lower(${table.mac_address})`).where(sql `${table.status} != 'ARCHIVED'`),
    uniqueIndex("validate_starter_number").on(sql `lower(${table.starter_number})`).where(sql `${table.status} != 'ARCHIVED'`),
    uniqueIndex("validate_pcb_number").on(sql `lower(${table.pcb_number})`).where(sql `${table.status} != 'ARCHIVED'`),
    uniqueIndex("validate_device_mobile_number").on(sql `lower(${table.device_mobile_number})`).where(sql `${table.status} != 'ARCHIVED'`),
]);
export const starterBoxesRelations = relations(starterBoxes, ({ one, many }) => ({
    user: one(users, {
        fields: [starterBoxes.user_id],
        references: [users.id],
    }),
    gateway: one(gateways, {
        fields: [starterBoxes.gateway_id],
        references: [gateways.id],
    }),
    motors: many(motors),
    starterParameters: many(starterBoxParameters),
    location: one(locations, {
        fields: [starterBoxes.location_id],
        references: [locations.id],
    })
}));
