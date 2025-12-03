import { index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.js";
import { sql, relations } from "drizzle-orm";
import { users } from "./users.js";
import { uniqueIndex } from "drizzle-orm/gel-core";
import { statusEnum } from "../../constants/enum-types.js";


export const gateways = pgTable("gateways", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  label: varchar("label"),
  location_id: integer("location_id").notNull().references(() => locations.id),
  user_id: integer("user_id").notNull().references(() => users.id),
  created_by: integer("created_by").notNull().references(() => users.id),
  status: statusEnum().notNull().default("ACTIVE"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow().default(sql`CURRENT_TIMESTAMP`),
}, (table: any) => [
  index("gateway_idx").on(table.id),
  index("gateway_user_id_idx").on(table.user_id),
  index("gateway_location_id_idx").on(table.location_id),

  uniqueIndex("validate_gateway_name").on(sql`lower(${table.name})`).where(sql`${table.status} != 'ARCHIVED'`),
]);

export const gatewaysRelations = relations(gateways, ({ one }) => ({
  location: one(locations, {
    fields: [gateways.location_id],
    references: [locations.id],
  }),
  user: one(users, {
    fields: [gateways.user_id],
    references: [users.id],
  }),
}));