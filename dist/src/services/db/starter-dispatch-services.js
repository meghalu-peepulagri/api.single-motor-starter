import { and, ne, eq, sql, or } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterDispatch } from "../../database/schemas/starter-dispatch.js";
import { users } from "../../database/schemas/users.js";
export async function getStarterDispatchByStarterId(starterId) {
    return await db.query.starterDispatch.findMany({
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
export async function getExpiringDispatches(type) {
    const simExpiryCondition = sql `TO_DATE(${starterDispatch.sim_recharge_end_date}, 'DD-MM-YYYY') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    const warrantyExpiryCondition = sql `TO_DATE(${starterDispatch.warranty_end_date}, 'DD-MM-YYYY') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    let expiryCondition;
    if (type === "recharge") {
        expiryCondition = simExpiryCondition;
    }
    else if (type === "warranty") {
        expiryCondition = warrantyExpiryCondition;
    }
    else {
        expiryCondition = or(simExpiryCondition, warrantyExpiryCondition);
    }
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
    });
}
