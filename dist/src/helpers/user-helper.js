import { MOBILE_NUMBER_UNIQUE } from "../constants/app-constants.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
export function userFilters(query) {
    const whereQueryData = {
        columns: ["status", "user_type"],
        relations: ["!=", "!="],
        values: ["ARCHIVED", "ADMIN"],
        or: []
    };
    if (query.search_string?.trim()) {
        const search = query.search_string.trim();
        whereQueryData.or.push({
            columns: ["full_name", "email", "phone", "alternate_phone_1", "alternate_phone_2", "alternate_phone_3", "alternate_phone_4", "alternate_phone_5"],
            relations: ["contains", "contains", "contains", "contains", "contains", "contains", "contains", "contains"],
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
export function checkInternalPhoneUniqueness(input) {
    const allPhones = [
        input.phone,
        input.alternate_phone_1,
        input.alternate_phone_2,
        input.alternate_phone_3,
        input.alternate_phone_4,
        input.alternate_phone_5,
    ].filter((p) => !!p);
    if (new Set(allPhones).size !== allPhones.length) {
        throw new BadRequestException(MOBILE_NUMBER_UNIQUE);
    }
    return allPhones;
}
