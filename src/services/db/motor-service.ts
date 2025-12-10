import { and, desc, isNotNull, ne, SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditions } from "../../utils/db-utils.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import type { OrderByQueryData, WhereQueryData } from "../../types/db-types.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { getRecordsCount } from "./base-db-services.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";

export async function bulkMotorsUpdate(motorsToUpdate: Array<{ id: number; name?: string | null; hp?: number | null }>, trx?: any): Promise<void> {
  if (!motorsToUpdate || motorsToUpdate.length === 0) return;

  const queryBuilder = trx || db;
  const ids = motorsToUpdate.map(m => m.id);

  // Prepare CASE statements for each column
  const nameCases: SQL[] = [];
  const hpCases: SQL[] = [];

  for (const m of motorsToUpdate) {
    // Name column
    if (m.name !== undefined) {
      const value = m.name === null ? sql`NULL` : m.name;
      nameCases.push(sql`WHEN ${m.id} THEN ${value}`);
    }

    // HP column (numeric) – preserve integers and decimals
    if (m.hp !== undefined) {
      const value = m.hp === null ? sql`NULL` : sql`${m.hp}::numeric`;
      hpCases.push(sql`WHEN ${m.id} THEN ${value}`);
    }

  }

  const setClauses: SQL[] = [];

  if (nameCases.length > 0) {
    setClauses.push(sql`name = CASE "motors".id ${sql.join(nameCases, sql` `)} END`);
  }
  if (hpCases.length > 0) {
    setClauses.push(sql`hp = CASE "motors".id ${sql.join(hpCases, sql` `)} END`);
  }


  // Always update timestamp
  setClauses.push(sql`updated_at = NOW()`);

  // Final bulk update query
  const query = sql`
    UPDATE "motors"
    SET ${sql.join(setClauses, sql`, `)}
    WHERE "motors".id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
    RETURNING *;
  `;

  await queryBuilder.execute(query);
}


export async function paginatedMotorsList(
  whereQueryData: WhereQueryData<MotorsTable>,
  orderByQueryData: OrderByQueryData<MotorsTable>,
  pageParams: { page: number; pageSize: number; offset: number }
) {
  // Prepare WHERE conditions
  const whereConditions = prepareWhereQueryConditions<MotorsTable>(motors, whereQueryData);
  const whereQuery = whereConditions?.length ? and(...whereConditions) : undefined;

  // Prepare ORDER BY
  const orderQuery = prepareOrderByQueryConditions<MotorsTable>(motors, orderByQueryData);

  // Fetch paginated list
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
              fault_code: true,
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
  } as any);

  // Count total records
  const totalRecords = await getRecordsCount(motors, whereConditions || []);

  // Prepare pagination metadata
  const pagination = getPaginationData(
    pageParams.page,
    pageParams.pageSize,
    totalRecords
  );

  return {
    pagination_info: pagination,
    records: motorsList,
  };
}


