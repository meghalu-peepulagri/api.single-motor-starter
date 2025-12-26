import { eq, ilike, ne, or } from "drizzle-orm";
import { locations } from "../database/schemas/locations.js";
export function locationFilters(query, userId) {
    const filters = [];
    filters.push(ne(locations.status, "ARCHIVED"));
    if (query.search_string?.trim()) {
        const s = `%${query.search_string.trim()}%`;
        filters.push(ilike(locations.name, s));
    }
    if (query.status) {
        filters.push(eq(locations.status, query.status));
    }
    if (query.location_id && !isNaN(Number(query.location_id))) {
        const locUserId = Number(query.location_id);
        filters.push(or(eq(locations.user_id, locUserId), eq(locations.created_by, locUserId)));
    }
    filters.push(or(eq(locations.user_id, userId), eq(locations.created_by, userId)));
    return filters;
}
