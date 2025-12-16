import { and, asc, desc, eq, gte, isNotNull, isNull, lte, ne, SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceRunTime } from "../../database/schemas/device-runtime.js";
import { locations } from "../../database/schemas/locations.js";
import { motorsRunTime } from "../../database/schemas/motor-runtime.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { formatDuration, getUTCFromDateAndToDate } from "../../helpers/dns-helpers.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import type { OrderByQueryData, WhereQueryData } from "../../types/db-types.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount } from "./base-db-services.js";

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


export async function paginatedMotorsList(whereQueryData: WhereQueryData<MotorsTable>, orderByQueryData: OrderByQueryData<MotorsTable>,
  pageParams: { page: number; pageSize: number; offset: number }
) {
  const whereConditions = prepareWhereQueryConditions<MotorsTable>(motors, whereQueryData);
  const whereQuery = whereConditions?.length ? and(...whereConditions) : undefined;

  const orderQuery = prepareOrderByQueryConditions<MotorsTable>(motors, orderByQueryData);

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
  } as any);

  // TOTAL COUNT
  const totalRecords = await getRecordsCount(motors, whereConditions || []);

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

export async function trackMotorRunTime(params: {
  starter_id: number; motor_id: number; location_id: number;
  previous_state: number; new_state: number; mode_description: string, time_stamp?: string
}) {
  const { starter_id, motor_id, location_id, new_state, mode_description, time_stamp } = params;

  if (!motor_id) return;
  const now = new Date();
  return await db.transaction(async (trx) => {
    const [openRecord] = await trx
      .select()
      .from(motorsRunTime)
      .where(
        and(
          eq(motorsRunTime.motor_id, motor_id),
          eq(motorsRunTime.starter_box_id, starter_id),
          isNull(motorsRunTime.end_time)
        )
      )
      .orderBy(desc(motorsRunTime.start_time));

    const formattedDate = time_stamp ? new Date(time_stamp).toISOString() : now.toISOString();

    //  No open record → create fresh one
    if (!openRecord) {
      return await trx.insert(motorsRunTime).values({
        motor_id,
        starter_box_id: starter_id,
        location_id,
        start_time: now,
        end_time: null,
        duration: null,
        motor_state: new_state,
        time_stamp: formattedDate,
        motor_mode: mode_description
      });
    }

    // Close open record 
    const durationMs = now.getTime() - new Date(openRecord.start_time).getTime();
    const durationFormatted = formatDuration(durationMs);

    await trx.update(motorsRunTime)
      .set({
        end_time: now,
        duration: durationFormatted,
        motor_state: new_state,
        motor_mode: mode_description,
      }).where(eq(motorsRunTime.id, openRecord.id));

    // After Update → Insert New Fresh Row 
    await trx.insert(motorsRunTime).values({
      motor_id,
      starter_box_id: starter_id,
      location_id,
      start_time: now,
      end_time: null,
      duration: null,
      motor_state: new_state,
      time_stamp: formattedDate,
      motor_mode: mode_description
    });
  });
}

export async function trackDeviceRunTime(params: {
  starter_id: number; motor_id: number | null; location_id: number;
  previous_power_state: number;
  new_power_state: number;
  motor_state: number;
  mode_description: string;
  time_stamp: string;
}) {
  const { starter_id, motor_id, location_id, new_power_state, motor_state, mode_description, time_stamp } = params;

  if (!starter_id) return;
  const now = new Date(time_stamp);
  return await db.transaction(async (trx) => {
    const [openRecord] = await trx
      .select()
      .from(deviceRunTime)
      .where(
        and(
          eq(deviceRunTime.starter_box_id, starter_id),
          isNull(deviceRunTime.end_time)
        )
      )
      .orderBy(desc(deviceRunTime.start_time));

    if (!openRecord) {
      return await trx.insert(deviceRunTime).values({
        motor_id,
        starter_box_id: starter_id,
        location_id,
        start_time: now,
        end_time: null,
        duration: null,
        motor_state,
        motor_mode: mode_description,
        power_state: new_power_state,
        signal_strength: null,
        time_stamp
      });
    }
    const durationMs = now.getTime() - new Date(openRecord.start_time).getTime();
    const durationFormatted = formatDuration(durationMs);

    if (openRecord.power_state !== new_power_state) {

      await trx.update(deviceRunTime).set({
        end_time: now,
        duration: durationFormatted,
        updated_at: now
      }).where(eq(deviceRunTime.id, openRecord.id));

      // Insert new runtime session
      return await trx.insert(deviceRunTime).values({
        motor_id,
        starter_box_id: starter_id,
        location_id,
        start_time: now,
        end_time: null,
        duration: null,
        motor_state,
        motor_mode: mode_description,
        power_state: new_power_state,
        signal_strength: null,
        time_stamp
      });
    }
  }
  );
}

export async function getMotorRunTime(starterId: number, fromDate: string, toDate: string, motorId?: number, motorState?: string) {
  // const { startOfDayUTC, endOfDayUTC } = getUTCFromDateAndToDate(fromDate, toDate);

  const filters = [
    eq(motorsRunTime.starter_box_id, starterId),
    gte(motorsRunTime.time_stamp, fromDate),
    lte(motorsRunTime.time_stamp, toDate),
  ];

  if (motorId) {
    filters.push(eq(motorsRunTime.motor_id, motorId));
  }

  if (motorState) {
    const motorStateNumber = motorState === "OFF" ? 0 : 1;
    filters.push(eq(motorsRunTime.motor_state, motorStateNumber));
  }

  return await db.query.motorsRunTime.findMany({
    where: and(...filters),
    orderBy: asc(motorsRunTime.time_stamp),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      duration: true,
      time_stamp: true,
      motor_state: true,
    }
  });
}