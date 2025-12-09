import { and } from "drizzle-orm";
import { locations, type LocationsTable } from "../../database/schemas/locations.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import type { OrderByQueryData, WhereQueryDataWithOr } from "../../types/db-types.js";
import db from "../../database/configuration.js";


export async function getLocationsList(whereQueryData: WhereQueryDataWithOr<LocationsTable>, orderQueryData: OrderByQueryData<LocationsTable>) {

  const whereConditions = prepareWhereQueryConditionsWithOr<LocationsTable>(locations, whereQueryData);
  const whereQuery = whereConditions && whereConditions.length > 0 ? and(...whereConditions) : undefined;
  const orderQuery = prepareOrderByQueryConditions<LocationsTable>(locations, orderQueryData);

  return await db.query.locations.findMany({
    where: whereQuery,
    orderBy: orderQuery,
    columns: {
      id: true,
      name: true,
      status: true
    }
  });

}