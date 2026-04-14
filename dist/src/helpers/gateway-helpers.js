import { eq, ilike, ne, or } from "drizzle-orm";
import { gateways } from "../database/schemas/gateways.js";
export function gatewayFilters(query, userId) {
    const filters = [];
    filters.push(ne(gateways.status, "ARCHIVED"));
    if (query.search_string?.trim()) {
        const s = `%${query.search_string.trim()}%`;
        filters.push(ilike(gateways.name, s));
    }
    if (query.status) {
        filters.push(eq(gateways.status, query.status));
    }
    if (query.location_id && !isNaN(Number(query.location_id))) {
        filters.push(eq(gateways.location_id, Number(query.location_id)));
    }
    if (typeof userId === "number") {
        filters.push(or(eq(gateways.user_id, userId), eq(gateways.created_by, userId)));
    }
    return filters;
}
