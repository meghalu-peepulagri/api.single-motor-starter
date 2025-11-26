import type { UsersTable } from "../database/schemas/users.js";
import type { WhereQueryDataWithOr } from "../types/db-types.js";


export function userFilters(query: any) {

  const whereQueryData: WhereQueryDataWithOr<UsersTable> = {
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

  if (query.status) {
    whereQueryData.columns.push("status");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.status);
  }


  return whereQueryData;
}
