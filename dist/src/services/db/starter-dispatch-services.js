import { and, ne, eq, sql, or, count } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterDispatch } from "../../database/schemas/starter-dispatch.js";
import { users } from "../../database/schemas/users.js";
export async function getStarterDispatchByStarterId(starterId) {
    return await db.query.starterDispatch.findFirst({
        where: and(eq(starterDispatch.starter_id, starterId), ne(starterDispatch.status, "ARCHIVED")),
        with: {
            createdBy: {
                where: ne(users.status, "ARCHIVED"),
                columns: {
                    id: true,
                    full_name: true,
                },
            },
            updatedBy: {
                where: ne(users.status, "ARCHIVED"),
                columns: {
                    id: true,
                    full_name: true,
                },
            },
        },
    });
}
function getExpiryCondition(type) {
    const simExpiryCondition = sql `TO_DATE(${starterDispatch.sim_recharge_end_date}, 'DD-MM-YYYY') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    const warrantyExpiryCondition = sql `TO_DATE(${starterDispatch.warranty_end_date}, 'DD-MM-YYYY') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    if (type === "recharge")
        return simExpiryCondition;
    if (type === "warranty")
        return warrantyExpiryCondition;
    return or(simExpiryCondition, warrantyExpiryCondition);
}
export async function getExpiringDispatchesCount(type) {
    const expiryCondition = getExpiryCondition(type);
    const result = await db.select({ total: count() }).from(starterDispatch)
        .where(and(ne(starterDispatch.status, "ARCHIVED"), expiryCondition));
    return result[0]?.total || 0;
}
export async function getExpiringDispatches(type, offset, limit) {
    const expiryCondition = getExpiryCondition(type);
    return await db.query.starterDispatch.findMany({
        where: and(ne(starterDispatch.status, "ARCHIVED"), expiryCondition),
        columns: {
            id: true,
            starter_id: true,
            customer_name: true,
            contact_number: true,
            address: true,
            location: true,
            sim_no: true,
            sim_recharge_end_date: true,
            warranty_end_date: true,
        },
        ...(offset !== undefined && limit !== undefined ? { offset, limit } : {}),
    });
}
