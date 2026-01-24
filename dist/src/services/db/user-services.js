import { and } from "drizzle-orm";
import db from "../../database/configuration.js";
import { users } from "../../database/schemas/users.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import { getRecordsCount } from "./base-db-services.js";
export async function paginatedUsersList(whereQueryData, orderByQueryData, pageParams) {
    const whereConditions = prepareWhereQueryConditionsWithOr(users, whereQueryData);
    const whereQuery = whereConditions && whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const orderQuery = prepareOrderByQueryConditions(users, orderByQueryData);
    const usersList = await db.query.users.findMany({
        where: whereQuery,
        orderBy: orderQuery,
        limit: pageParams.pageSize,
        offset: pageParams.offset,
        columns: {
            id: true, full_name: true, email: true, phone: true, status: true, created_at: true, updated_at: true,
        },
    });
    const totalRecords = await getRecordsCount(users, whereConditions || []);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return {
        pagination_info: pagination,
        records: usersList,
    };
}
// export async function checkPhoneUniqueness(phones: string[], excludeUserId?: number): Promise<boolean> {
//   if (phones.length === 0) return true;
//   const phoneConditions = or(
//     inArray(users.phone, phones),
//     inArray(users.alternate_phone_1, phones),
//     inArray(users.alternate_phone_2, phones),
//     inArray(users.alternate_phone_3, phones),
//     inArray(users.alternate_phone_4, phones),
//     inArray(users.alternate_phone_5, phones)
//   );
//   let finalCondition = and(ne(users.status, "ARCHIVED"), phoneConditions);
//   if (excludeUserId) {
//     finalCondition = and(finalCondition, ne(users.id, excludeUserId));
//   }
//   const existingUsers = await db.select({ id: users.id }).from(users).where(finalCondition).limit(1);
//   return existingUsers.length === 0;
// }
// export async function checkPhoneUniquenessVerify(phones: string[], excludeUserId?: number) {
//   if (phones.length === 0) return true;
//   const phoneConditions = or(
//     inArray(users.phone, phones),
//     inArray(users.alternate_phone_1, phones),
//     inArray(users.alternate_phone_2, phones),
//     inArray(users.alternate_phone_3, phones),
//     inArray(users.alternate_phone_4, phones),
//     inArray(users.alternate_phone_5, phones)
//   );
//   let finalCondition = and(ne(users.status, "ARCHIVED"), phoneConditions);
//   if (excludeUserId) {
//     finalCondition = and(finalCondition, ne(users.id, excludeUserId));
//   }
//   return await db.select({ id: users.id }).from(users).where(finalCondition).limit(1);
// }
