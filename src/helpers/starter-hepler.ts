import { eq, ilike, ne, sql } from "drizzle-orm";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import type { User } from "../database/schemas/users.js";
import type { starterBoxPayloadType } from "../types/app-types.js";


export function prepareStarterData(starterBoxPayload: starterBoxPayloadType, userPayload: User) {

  const motorDetails = {
    name: `Pump 1 - ${starterBoxPayload.pcb_number}`,
    hp: 2,
  };

  return { ...starterBoxPayload, created_by: userPayload.id, motorDetails }
};

export function starterFilters(query: any, user: any) {
  const filters: any[] = [];

  filters.push(ne(starterBoxes.status, "ARCHIVED"));

  if (query.search_string?.trim()) {
    const s = `%${query.search_string.trim()}%`.toLowerCase();
    const searchCondition = [
      ilike(starterBoxes.name, s),
      ilike(starterBoxes.pcb_number, s),
      ilike(starterBoxes.starter_number, s),
      ilike(starterBoxes.mac_address, s),
    ];

    if (user.user_type === "ADMIN") {
      filters.push(sql`(${sql.join(searchCondition, sql` OR `)})`);
    } else {
      filters.push(ilike(starterBoxes.pcb_number, s));
    }
  }

  if (query.status) {
    filters.push(eq(starterBoxes.status, query.status));
  }

  if (query.user_id) {
    filters.push(eq(starterBoxes.user_id, query.user_id));
  }

  if (query.location_id) {
    filters.push(eq(starterBoxes.location_id, query.location_id));
  }

  if (query.power) {
    filters.push(eq(starterBoxes.power, query.power));
  }

  if (query.device_status) {
    filters.push(eq(starterBoxes.device_status, query.device_status));
  }

  if (user.user_type === "ADMIN") {
    filters.push(ne(starterBoxes.user_id, user.id));
  }

  if (user.user_type !== "ADMIN") {
    filters.push(eq(starterBoxes.user_id, user.id));
  }

  return filters;
}
