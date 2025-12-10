import { and, desc, isNotNull, ne, SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditions } from "../../utils/db-utils.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { getRecordsCount } from "./base-db-services.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { locations } from "../../database/schemas/locations.js";
export async function bulkMotorsUpdate(motorsToUpdate, trx) {
    if (!motorsToUpdate || motorsToUpdate.length === 0)
        return;
    const queryBuilder = trx || db;
    const ids = motorsToUpdate.map(m => m.id);
    // Prepare CASE statements for each column
    const nameCases = [];
    const hpCases = [];
    for (const m of motorsToUpdate) {
        // Name column
        if (m.name !== undefined) {
            const value = m.name === null ? sql `NULL` : m.name;
            nameCases.push(sql `WHEN ${m.id} THEN ${value}`);
        }
        // HP column (numeric) – preserve integers and decimals
        if (m.hp !== undefined) {
            const value = m.hp === null ? sql `NULL` : sql `${m.hp}::numeric`;
            hpCases.push(sql `WHEN ${m.id} THEN ${value}`);
        }
    }
    const setClauses = [];
    if (nameCases.length > 0) {
        setClauses.push(sql `name = CASE "motors".id ${sql.join(nameCases, sql ` `)} END`);
    }
    if (hpCases.length > 0) {
        setClauses.push(sql `hp = CASE "motors".id ${sql.join(hpCases, sql ` `)} END`);
    }
    // Always update timestamp
    setClauses.push(sql `updated_at = NOW()`);
    // Final bulk update query
    const query = sql `
    UPDATE "motors"
    SET ${sql.join(setClauses, sql `, `)}
    WHERE "motors".id IN (${sql.join(ids.map(id => sql `${id}`), sql `, `)})
    RETURNING *;
  `;
    await queryBuilder.execute(query);
}
export async function paginatedMotorsList(whereQueryData, orderByQueryData, pageParams) {
    const whereConditions = prepareWhereQueryConditions(motors, whereQueryData);
    const whereQuery = whereConditions?.length ? and(...whereConditions) : undefined;
    const orderQuery = prepareOrderByQueryConditions(motors, orderByQueryData);
    const motorsList = await db.query.motors.findMany({
        where: whereQuery,
        orderBy: orderQuery,
        limit: pageParams.pageSize,
        offset: pageParams.offset,
        columns: {
            id: true,
            name: true,
            hp: true,
            mode: true,
            state: true,
        },
        with: {
            location: {
                where: ne(locations.status, "ARCHIVED"),
                columns: { id: true, name: true },
            },
            starter: {
                where: ne(starterBoxes.status, "ARCHIVED"),
                columns: {
                    id: true,
                    name: true,
                    status: true,
                    mac_address: true,
                    signal_quality: true,
                    power: true,
                    network_type: true,
                },
                with: {
                    starterParameters: {
                        where: isNotNull(starterBoxParameters.time_stamp),
                        orderBy: [desc(starterBoxParameters.time_stamp)],
                        limit: 1,
                        columns: {
                            id: true,
                            time_stamp: true,
                            fault: true,
                            fault_description: true,
                            line_voltage_r: true,
                            line_voltage_y: true,
                            line_voltage_b: true,
                            current_r: true,
                            current_y: true,
                            current_b: true,
                        },
                    },
                },
            },
        },
    });
    // TOTAL COUNT
    const totalRecords = await getRecordsCount(motors, whereConditions || []);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return {
        pagination_info: pagination,
        records: motorsList,
    };
}
