import { eq, ilike, isNull, ne, or } from "drizzle-orm";
import { gateways } from "../database/schemas/gateways.js";

export function getGatewayIdentifierLowers(data: {
  name: string;
  mac_address: string;
  pcb_number: string;
  gateway_number?: string | null;
}) {
  const nameLower = data.name.trim().toLowerCase();
  const macLower = data.mac_address.trim().toLowerCase();
  const pcbLower = data.pcb_number.trim().toLowerCase();
  const gatewayNumberLower = data.gateway_number?.trim().toLowerCase() ?? null;

  return { nameLower, macLower, pcbLower, gatewayNumberLower };
}

export function gatewayFilters(query: any, userId?: number) {
  const filters: any[] = [];
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

export function gatewayDropdownFilters(query: any, userId?: number) {
  const filters: any[] = [];
  filters.push(ne(gateways.status, "ARCHIVED"));

  const search = (query.search_string ?? query.search ?? "").trim();
  if (search) {
    const s = `%${search}%`;
    filters.push(or(ilike(gateways.pcb_number, s), ilike(gateways.mac_address, s)));
  }

  const onlyUnassignedRaw = query.only_unassigned ?? query.unassigned;
  const onlyUnassigned =
    onlyUnassignedRaw == null
      ? true
      : ["1", "true", "yes"].includes(String(onlyUnassignedRaw).toLowerCase());
  if (onlyUnassigned) {
    filters.push(isNull(gateways.user_id));
  }

  if (typeof userId === "number") {
    filters.push(or(eq(gateways.user_id, userId), eq(gateways.created_by, userId)));
  }

  return filters;
}
