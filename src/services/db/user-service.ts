import { and } from "drizzle-orm";
import db from "../../database/configuration.js";
import { users, type UsersTable } from "../../database/schemas/users.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import type { OrderByQueryData, WhereQueryDataWithOr } from "../../types/db-types.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import { getRecordsCount } from "./base-db-services.js";


export async function paginatedUsersList(whereQueryData: WhereQueryDataWithOr<UsersTable>, orderByQueryData: OrderByQueryData<UsersTable>,
  pageParams: { page: number; pageSize: number; offset: number }) {

  const whereConditions = prepareWhereQueryConditionsWithOr<UsersTable>(users, whereQueryData);
  const whereQuery = whereConditions && whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const orderQuery = prepareOrderByQueryConditions<UsersTable>(users, orderByQueryData);

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
