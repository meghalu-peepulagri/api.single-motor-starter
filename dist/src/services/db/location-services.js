import { and } from "drizzle-orm";
import { locations } from "../../database/schemas/locations.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import db from "../../database/configuration.js";
export async function getLocationsList(whereQueryData, orderQueryData) {
    const whereConditions = prepareWhereQueryConditionsWithOr(locations, whereQueryData);
    const whereQuery = whereConditions && whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const orderQuery = prepareOrderByQueryConditions(locations, orderQueryData);
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
