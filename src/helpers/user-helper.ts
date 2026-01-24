import { MOBILE_NUMBER_UNIQUE } from "../constants/app-constants.js";
import type { UsersTable } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
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
      values: [search, search, search, search, search, search, search, search],
    });
  }

  if (query.status) {
    whereQueryData.columns.push("status");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.status);
  }


  return whereQueryData;
}

export function checkInternalPhoneUniqueness(input: any) {
  const allPhones = [
    input.phone,
    input.alternate_phone_1,
    input.alternate_phone_2,
    input.alternate_phone_3,
    input.alternate_phone_4,
    input.alternate_phone_5,
  ].filter((p): p is string => !!p);

  if (new Set(allPhones).size !== allPhones.length) {
    throw new BadRequestException(MOBILE_NUMBER_UNIQUE);
  }

  return allPhones;
}
