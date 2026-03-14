import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceRunTime } from "../../database/schemas/device-runtime.js";
import { locations } from "../../database/schemas/locations.js";
import { motorsRunTime } from "../../database/schemas/motor-runtime.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { formatDuration, parseDurationToSeconds } from "../../helpers/dns-helpers.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { splitRuntimeRecordsByDate } from "../../helpers/runtime-date-split-helper.js";
import type { OrderByQueryData, WhereQueryData } from "../../types/db-types.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount } from "./base-db-services.js";

// Extract transaction type from Drizzle's db.transaction callback
type DbTransaction = Parameters<Parameters<typeof db["transaction"]>[0]>[0];

export async function bulkMotorsUpdate(motorsToUpdate: Array<{ id: number; name?: string | null; hp?: number | null }>, trx?: DbTransaction): Promise<void> {
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
      alias_name: true,
      test_run_status: true,
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
          pcb_number: true,
          signal_quality: true,
          power: true,
          network_type: true,
          starter_number: true,
          device_allocation: true,
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
  starter_id: number;
  motor_id: number;
  location_id: number;
  previous_state: number;
  new_state: number;
  mode_description: string;
  time_stamp?: string;
  previous_power_state?: number;
  new_power_state?: number;
}, externalTrx?: DbTransaction) {
  const {
    starter_id,
    motor_id,
    location_id,
    previous_state,
    new_state,
    mode_description,
    time_stamp,
    previous_power_state,
    new_power_state,
  } = params;

  // Early return if required IDs are missing
  if (!motor_id || !starter_id) return;

  const now = time_stamp ? new Date(time_stamp) : new Date();
  const formattedDate = now.toISOString();

  const action = async (trx: DbTransaction) => {
    // Fetch the most recent open record for this motor
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
      .orderBy(desc(motorsRunTime.start_time))
      .limit(1);

    // Detect state changes
    const motorStateChanged = previous_state !== new_state;
    const powerStateChanged =
      previous_power_state !== undefined &&
      new_power_state !== undefined &&
      previous_power_state !== new_power_state;

    // Case 1: No open record exists - Create initial record
    if (!openRecord) {
      await trx.insert(motorsRunTime).values({
        motor_id,
        starter_box_id: starter_id,
        location_id,
        start_time: now,
        end_time: null,
        duration: null,
        motor_state: new_state,
        motor_mode: mode_description,
        time_stamp: formattedDate,
        power_start: new_power_state !== undefined ? formattedDate : null,
        power_end: null,
        power_state: new_power_state !== undefined ? new_power_state : null,
        power_duration: null,
      });
      return;
    }

    // Skip out-of-order messages: if incoming timestamp is older than the open record's start_time
    if (now.getTime() < new Date(openRecord.start_time).getTime()) {
      return;
    }

    // Calculate durations
    const totalDurationMs = now.getTime() - new Date(openRecord.start_time).getTime();
    const motorDurationFormatted = formatDuration(totalDurationMs);

    let powerDurationFormatted: string | null = null;
    if (openRecord.power_start) {
      const powerStartTime = new Date(openRecord.power_start);
      const powerDurationMs = now.getTime() - powerStartTime.getTime();
      powerDurationFormatted = formatDuration(powerDurationMs);
    }

    // Case 2: Motor state changed
    if (motorStateChanged) {
      // Close the current motor session
      await trx
        .update(motorsRunTime)
        .set({
          end_time: now,
          duration: motorDurationFormatted,
          motor_mode: mode_description,
          time_stamp: formattedDate,
          // Close power session ONLY if power state also changed
          power_end: powerStateChanged ? formattedDate : openRecord.power_end,
          power_duration: powerStateChanged ? powerDurationFormatted : openRecord.power_duration,
          updated_at: now,
        })
        .where(eq(motorsRunTime.id, openRecord.id));

      // Start a new motor session
      await trx.insert(motorsRunTime).values({
        motor_id,
        starter_box_id: starter_id,
        location_id,
        start_time: now,
        end_time: null,
        duration: null,
        motor_state: new_state,
        motor_mode: mode_description,
        time_stamp: formattedDate,
        // If power state changed: start new power session
        // If power state NOT changed: carry forward the existing power_start from previous record
        power_start: powerStateChanged ? formattedDate : openRecord.power_start,
        power_end: null,
        power_state: powerStateChanged ? new_power_state : openRecord.power_state,
        power_duration: null,
      });
      return;
    }

    // Case 3: Only power state changed (motor state same)
    if (powerStateChanged && !motorStateChanged) {
      // Close the current motor + power session and start a new segment
      await trx
        .update(motorsRunTime)
        .set({
          end_time: now,
          duration: motorDurationFormatted,
          power_end: formattedDate,
          power_duration: powerDurationFormatted,
          time_stamp: formattedDate,
          updated_at: now,
        })
        .where(eq(motorsRunTime.id, openRecord.id));

      // Create a new record with new power session (motor session continues)
      await trx.insert(motorsRunTime).values({
        motor_id,
        starter_box_id: starter_id,
        location_id,
        start_time: now,
        end_time: null,
        duration: null,
        motor_state: new_state, // Same motor state
        motor_mode: mode_description,
        time_stamp: formattedDate,
        power_start: formattedDate, // New power session starts
        power_end: null,
        power_state: new_power_state,
        power_duration: null,
      });
      return;
    }

    // Case 4: No state changes - Just update timestamp
    if (!motorStateChanged && !powerStateChanged) {
      await trx
        .update(motorsRunTime)
        .set({
          motor_mode: mode_description,
          time_stamp: formattedDate,
          updated_at: now,
        })
        .where(eq(motorsRunTime.id, openRecord.id));
    }
  };

  // Execute with or without external transaction
  if (externalTrx) {
    return await action(externalTrx);
  } else {
    return await db.transaction(action);
  }
}

export async function trackDeviceRunTime(params: {
  starter_id: number; motor_id: number | null; location_id: number;
  previous_power_state: number;
  new_power_state: number;
  motor_state: number;
  mode_description: string;
  time_stamp: string;
}, externalTrx?: DbTransaction) {
  const { starter_id, motor_id, location_id, new_power_state, motor_state, mode_description, time_stamp } = params;

  if (!starter_id) return;
  const now = new Date(time_stamp);

  const action = async (trx: DbTransaction) => {
    const [openRecord] = await trx
      .select()
      .from(deviceRunTime)
      .where(
        and(
          eq(deviceRunTime.starter_box_id, starter_id),
          isNull(deviceRunTime.end_time)
        )
      )
      .orderBy(desc(deviceRunTime.start_time))
      .limit(1);

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
      // Skip out-of-order messages: if incoming timestamp is older than the open record's start_time
      if (now.getTime() < new Date(openRecord.start_time).getTime()) {
        return;
      }

      const motorStateChanged = openRecord.motor_state !== motor_state;
      const powerStateChanged = openRecord.power_state !== new_power_state;

      // No state change: keep the record open and avoid creating duplicates
      if (!motorStateChanged && !powerStateChanged) {
        await trx.update(deviceRunTime).set({
          updated_at: now
        }).where(eq(deviceRunTime.id, openRecord.id));
        return;
      }

      const durationMs = now.getTime() - new Date(openRecord.start_time).getTime();
      const durationFormatted = formatDuration(durationMs);

      await trx.update(deviceRunTime).set({
        end_time: now,
        duration: durationFormatted,
        updated_at: now,
        time_stamp
      }).where(eq(deviceRunTime.id, openRecord.id));

      // Insert new runtime session starting exactly at previous end_time
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
  };

  if (externalTrx) {
    return await action(externalTrx);
  } else {
    return await db.transaction(action);
  }
}

export async function getMotorRunTime(starterId: number, fromDateUTC: string, toDateUTC: string, motorId?: number, motorState?: string, isSingleDate?: boolean) {

  const from = new Date(fromDateUTC);
  const to = new Date(toDateUTC);

  // Fetch records that overlap with the date range:
  // start_time <= toDate AND (end_time >= fromDate OR end_time IS NULL)
  const filters: (SQL | undefined)[] = [
    eq(motorsRunTime.starter_box_id, starterId),
    lte(motorsRunTime.start_time, to),
    or(
      gte(motorsRunTime.end_time, from),
      isNull(motorsRunTime.end_time),
    ),
  ];

  if (motorId) {
    filters.push(eq(motorsRunTime.motor_id, motorId));
  }

  if (motorState) {
    const motorStateNumber = motorState === "OFF" ? 0 : 1;
    filters.push(eq(motorsRunTime.motor_state, motorStateNumber));
  }

  const records = await db.query.motorsRunTime.findMany({
    where: and(...filters),
    orderBy: asc(motorsRunTime.start_time),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      duration: true,
      time_stamp: true,
      motor_state: true,
      power_start: true,
      power_end: true,
      power_duration: true,
      power_state: true,
    }
  });

  // Clamp records to the requested date range and split cross-midnight records
  const splitRecords = splitRuntimeRecordsByDate(records, from, to);

  const totalOnSeconds = splitRecords.reduce((sum, record) => {
    if (record.motor_state !== 1 || !record.duration) return sum;
    return sum + parseDurationToSeconds(record.duration);
  }, 0);

  return {
    total_run_on_time: formatDuration(totalOnSeconds * 1000),
    records: splitRecords,
  };
}

export async function getMotorsTotalRunOnTime(motorIds: number[]) {
  if (!motorIds.length) return {};

  // Default to today's date range in IST
  const IST = "Asia/Kolkata";
  const moment = (await import("moment-timezone")).default;
  const now = moment().tz(IST);
  const fromDateObj = now.clone().startOf("day").utc().toDate();
  const toDateObj = now.clone().endOf("day").utc().toDate();

  // Only fetch records that have an actual end_time (completed sessions)
  const records = await db.query.motorsRunTime.findMany({
    where: and(
      inArray(motorsRunTime.motor_id, motorIds),
      isNotNull(motorsRunTime.end_time),
      lte(motorsRunTime.start_time, toDateObj),
      gte(motorsRunTime.end_time, fromDateObj),
    ),
    columns: {
      motor_id: true,
      start_time: true,
      end_time: true,
      duration: true,
      motor_state: true,
    },
    orderBy: asc(motorsRunTime.start_time),
  });

  // Group records by motor_id
  const groupedByMotor: Record<number, typeof records> = {};
  for (const record of records) {
    if (!record.motor_id) continue;
    if (!groupedByMotor[record.motor_id]) groupedByMotor[record.motor_id] = [];
    groupedByMotor[record.motor_id].push(record);
  }

  const runTimeMap: Record<number, string> = {};

  for (const [motorIdStr, motorRecords] of Object.entries(groupedByMotor)) {
    let totalSeconds = 0;

    for (let i = 0; i < motorRecords.length; i++) {
      const record = motorRecords[i];
      if (record.motor_state !== 1) continue;
      if (!record.end_time) continue;

      const start = new Date(record.start_time);
      const end = new Date(record.end_time);

      // Clamp to date range
      const segmentStart = start > fromDateObj ? start : fromDateObj;
      const segmentEnd = end < toDateObj ? end : toDateObj;
      if (segmentEnd > segmentStart) {
        totalSeconds += Math.floor((segmentEnd.getTime() - segmentStart.getTime()) / 1000);
      }
    }

    runTimeMap[Number(motorIdStr)] = formatDuration(totalSeconds * 1000);
  }

  return runTimeMap;
}

export async function updateStarterStatusWithTransaction(starterIds: number[]) {
  const action = async (trx: DbTransaction) => {
    // Update starters to INACTIVE
    const inActiveStarterIds = await trx
      .update(starterBoxes)
      .set({ status: "INACTIVE", signal_quality: 0 })
      .where(
        and(
          notInArray(starterBoxes.id, starterIds),
          eq(starterBoxes.status, "ACTIVE")
        )
      )
      .returning({ id: starterBoxes.id });

    // Update starters to ACTIVE
    const activeStarterIds = await trx
      .update(starterBoxes)
      .set({ status: "ACTIVE", signal_quality: 10 })
      .where(
        and(
          inArray(starterBoxes.id, starterIds),
          eq(starterBoxes.status, "INACTIVE")
        )
      )
      .returning({ id: starterBoxes.id });

    const inactiveIds = inActiveStarterIds.map((row: { id: number }) => row.id);
    const activeIds = activeStarterIds.map((row: { id: number }) => row.id);

    // Update motors to INACTIVE
    if (inactiveIds.length > 0) {
      await trx
        .update(motors)
        .set({ status: "INACTIVE" })
        .where(
          and(
            inArray(motors.starter_id, inactiveIds),
            ne(motors.status, "ARCHIVED")
          )
        );
    }

    // Update motors to ACTIVE
    if (activeIds.length > 0) {
      await trx
        .update(motors)
        .set({ status: "ACTIVE" })
        .where(
          and(
            inArray(motors.starter_id, activeIds),
            ne(motors.status, "ARCHIVED")
          )
        );
    }

    return {
      inactiveStarterIds: inactiveIds,
      activeStarterIds: activeIds,
    };
  };

  const result = await db.transaction(action);
  return result;
}

export async function getMotorBasedStarterDetails(motorId: number) {
  try {
    const motorDetails = await db.query.motors.findFirst({
      where: eq(motors.id, motorId),
      columns: {},
      with: {
        starter: {
          columns: {
            id: true,
            assigned_at: true,
          },
        },
      },
    });

    return motorDetails;
  } catch (error) {
    console.error("Error fetching motor-based starter details:", error);
    throw error;
  }
}
