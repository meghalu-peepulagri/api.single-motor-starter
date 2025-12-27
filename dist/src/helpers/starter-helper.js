import { eq, ilike, ne, sql } from "drizzle-orm";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { motors } from "../database/schemas/motors.js";
export function prepareStarterData(starterBoxPayload, userPayload) {
    const motorDetails = {
        name: `Pump 1 - ${starterBoxPayload.pcb_number}`,
        hp: 2,
    };
    return { ...starterBoxPayload, status: "INACTIVE", created_by: userPayload.id, motorDetails };
}
;
export function starterFilters(query, user) {
    const filters = [];
    filters.push(ne(starterBoxes.status, "ARCHIVED"));
    if (query.search_string?.trim()) {
        const s = `%${query.search_string.trim()}%`;
        if (user.user_type === "ADMIN") {
            filters.push(sql `(
          ${starterBoxes.pcb_number} ILIKE ${s}
          OR ${starterBoxes.starter_number} ILIKE ${s}
        )`);
        }
        else {
            filters.push(sql `(
          ${starterBoxes.pcb_number} ILIKE ${s} OR
          EXISTS (
            SELECT 1
            FROM ${motors} AS m
            WHERE m.starter_id = ${starterBoxes.id} 
              AND m.status <> 'ARCHIVED'
              AND m.alias_name ILIKE ${s}
          )
        )`);
        }
    }
    if (query.status)
        filters.push(eq(starterBoxes.status, query.status));
    if (query.location_id)
        filters.push(eq(starterBoxes.location_id, query.location_id));
    if (query.power) {
        const powerValue = query.power === "ON" ? 1 : query.power === "OFF" ? 0 : undefined;
        if (powerValue !== undefined) {
            filters.push(eq(starterBoxes.power, powerValue));
        }
    }
    if (query.device_status)
        filters.push(eq(starterBoxes.device_status, query.device_status));
    if (query.user_id)
        filters.push(eq(starterBoxes.user_id, query.user_id));
    if (user.user_type !== "ADMIN")
        filters.push(eq(starterBoxes.user_id, user.id));
    return filters;
}
