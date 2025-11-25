import type { User, UsersTable } from "../database/schemas/users.js";
import type { WhereQueryDataV2 } from "../types/db-types.js";


export function userFilters(query: any, userPayload: User) {

  const whereQueryData: WhereQueryDataV2<UsersTable> = {
    columns: ["status", "user_type"],
    relations: ["!=", "!="],
    values: ["ARCHIVED", "ADMIN"],
    or: []
  };

  if (query.search_string?.trim()) {
    const search = query.search_string.trim();

    whereQueryData.or!.push({
      columns: ["full_name", "email", "phone"],
      relations: ["contains", "contains", "contains"],
      values: [search, search, search],
    });
  }

  if (userPayload.id) {
    whereQueryData.columns.push("id");
    whereQueryData.relations.push("!=");
    whereQueryData.values.push(userPayload.id);
  }

  if (query.status) {
    whereQueryData.columns.push("status");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.status);
  }

  return whereQueryData;
}
