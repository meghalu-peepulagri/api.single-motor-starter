import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { statusEnum } from "../../constants/enum-types.js";
import { users } from "./users.js";
import { fields } from "./fields.js";
import { motors } from "./motors.js";
export const locations = pgTable("locations", {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    user_id: integer("user_id").notNull().references(() => users.id),
    created_by: integer("created_by").references(() => users.id),
    status: statusEnum().default("ACTIVE"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql `CURRENT_TIMESTAMP`),
}, table => [
    index("location_name_idx").on(table.name),
    index("user_id_idx").on(table.user_id),
    index("location_status_idx").on(table.status),
    uniqueIndex("unique_location_per_user").on(sql `lower(${table.name})`, table.user_id).where(sql `${table.status} != 'ARCHIVED'`),
]);
export const locationRelations = relations(locations, ({ one, many }) => ({
    owner: one(users, {
        fields: [locations.user_id],
        references: [users.id],
        relationName: "ownedLocations"
    }),
    creator: one(users, {
        fields: [locations.created_by],
        references: [users.id],
        relationName: "createdLocations"
    }),
    motors: many(motors),
}));
