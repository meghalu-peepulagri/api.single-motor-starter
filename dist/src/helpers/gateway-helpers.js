import { eq, ilike, isNull, ne, or } from "drizzle-orm";
import { gateways } from "../database/schemas/gateways.js";
export function getGatewayIdentifierLowers(data) {
    const nameLower = data.name?.trim().toLowerCase() ?? null;
    const macLower = data.mac_address.trim().toLowerCase();
    const pcbLower = data.pcb_number.trim().toLowerCase();
    const gatewayNumberLower = data.gateway_number?.trim().toLowerCase() ?? null;
    return { nameLower, macLower, pcbLower, gatewayNumberLower };
}
export function buildGatewayUpdatePayload(validReq, current) {
    const nameLower = validReq.name && validReq.name !== current.name
        ? validReq.name.toLowerCase() : null;
    const gatewayNumberLower = validReq.gateway_number && validReq.gateway_number !== current.gateway_number
        ? validReq.gateway_number.toLowerCase() : null;
    const macLower = validReq.mac_address && validReq.mac_address !== current.mac_address
        ? validReq.mac_address.toLowerCase() : null;
    const pcbLower = validReq.pcb_number && validReq.pcb_number !== current.pcb_number
        ? validReq.pcb_number.toLowerCase() : null;
    const updateData = {};
    if (validReq.name !== undefined)
        updateData.name = validReq.name;
    if (validReq.gateway_number !== undefined)
        updateData.gateway_number = validReq.gateway_number;
    if (validReq.label !== undefined)
        updateData.label = validReq.label;
    if (validReq.mac_address !== undefined)
        updateData.mac_address = validReq.mac_address;
    if (validReq.pcb_number !== undefined)
        updateData.pcb_number = validReq.pcb_number;
    const oldData = {};
    for (const key of Object.keys(updateData)) {
        oldData[key] = current[key] ?? null;
    }
    return {
        updateData,
        oldData,
        changedIdentifiers: { nameLower, gatewayNumberLower, macLower, pcbLower },
    };
}
export function gatewayFilters(query, userId) {
    const filters = [];
    filters.push(ne(gateways.status, "ARCHIVED"));
    if (query.search_string?.trim()) {
        const s = `%${query.search_string.trim()}%`;
        filters.push(ilike(gateways.name, s));
        filters.push(ilike(gateways.pcb_number, s));
        filters.push(ilike(gateways.mac_address, s));
        filters.push(ilike(gateways.gateway_number, s));
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
export function gatewayDropdownFilters(query, userId, isAdmin) {
    const filters = [];
    // Exclude archived
    filters.push(ne(gateways.status, "ARCHIVED"));
    //  Search
    const search = (query.search_string ?? query.search ?? "").trim();
    if (search) {
        const s = `%${search}%`;
        filters.push(or(ilike(gateways.pcb_number, s), ilike(gateways.mac_address, s)));
    }
    // Role-based logic
    if (isAdmin) {
        // Admin / Super Admin
        if (typeof userId === "number") {
            // If user_id passed → assigned gateways
            filters.push(eq(gateways.user_id, userId));
        }
        else {
            // If no user_id → only unassigned
            filters.push(isNull(gateways.user_id));
        }
    }
    else {
        // Normal User
        if (typeof userId === "number") {
            filters.push(eq(gateways.user_id, userId));
        }
    }
    return filters;
}
