import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { locations } from "../../database/schemas/locations.js";
import { motors } from "../../database/schemas/motors.js";
import { users, type UsersTable } from "../../database/schemas/users.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import type { OrderByQueryData, WhereQueryDataWithOr } from "../../types/db-types.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import { getRecordsCount } from "./base-db-services.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";


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
      id: true, full_name: true, email: true, phone: true, alternate_phone_1: true, alternate_phone_2: true, alternate_phone_3: true, alternate_phone_4: true, alternate_phone_5: true, status: true, created_at: true, updated_at: true,
    },
  });

  const totalRecords = await getRecordsCount(users, whereConditions || []);
  const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);

  return {
    pagination_info: pagination,
    records: usersList,
  };
}

export async function checkPhoneUniqueness(phones: string[], excludeUserId?: number): Promise<boolean> {
  if (phones.length === 0) return true;

  const phoneConditions = or(
    inArray(users.phone, phones),
    inArray(users.alternate_phone_1, phones),
    inArray(users.alternate_phone_2, phones),
    inArray(users.alternate_phone_3, phones),
    inArray(users.alternate_phone_4, phones),
    inArray(users.alternate_phone_5, phones)
  );

  let finalCondition = and(ne(users.status, "ARCHIVED"), phoneConditions);
  if (excludeUserId) {
    finalCondition = and(finalCondition, ne(users.id, excludeUserId));
  }

  const existingUsers = await db.select({ id: users.id }).from(users).where(finalCondition).limit(1);
  return existingUsers.length === 0;
}


export async function checkPhoneUniquenessVerify(phones: string[], excludeUserId?: number) {
  if (phones.length === 0) return true;

  const phoneConditions = or(
    inArray(users.phone, phones),
    inArray(users.alternate_phone_1, phones),
    inArray(users.alternate_phone_2, phones),
    inArray(users.alternate_phone_3, phones),
    inArray(users.alternate_phone_4, phones),
    inArray(users.alternate_phone_5, phones)
  );

  let finalCondition = and(ne(users.status, "ARCHIVED"), phoneConditions);
  if (excludeUserId) {
    finalCondition = and(finalCondition, ne(users.id, excludeUserId));
  }
  return await db.select({ id: users.id }).from(users).where(finalCondition).limit(1);
}


export async function getUserDetailsWithLocations(userId: number, pageParams: { page: number; pageSize: number; offset: number }) {
  // 1. Get user details (exclude password)
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), ne(users.status, "ARCHIVED")),
    columns: {
      id: true,
      full_name: true,
      email: true,
      phone: true,
      alternate_phone_1: true,
      alternate_phone_2: true,
      alternate_phone_3: true,
      alternate_phone_4: true,
      alternate_phone_5: true,
      user_type: true,
      address: true,
      status: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!user) return null;

  // 2. Get total locations count for this user
  const [locationsCount] = await db
    .select({ total: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(locations)
    .where(and(eq(locations.user_id, userId), ne(locations.status, "ARCHIVED")));

  const totalRecords = locationsCount.total;
  const paginationInfo = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);

  // 3. Get paginated locations with motors and device (starter) details
  const paginatedLocations = await db.query.locations.findMany({
    where: and(eq(locations.user_id, userId), ne(locations.status, "ARCHIVED")),
    orderBy: [desc(locations.created_at)],
    limit: pageParams.pageSize,
    offset: pageParams.offset,
    columns: {
      id: true,
      name: true,
      status: true,
      created_at: true,
    },
    extras: {
      total_motors: sql<number>`
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.status <> 'ARCHIVED'
        )
      `.as("total_motors"),

      on_state_count: sql<number>`
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.state = 1
          AND motors.status <> 'ARCHIVED'
        )
      `.as("on_state_count"),

      auto_mode_count: sql<number>`
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.mode = 'AUTO'
          AND motors.status <> 'ARCHIVED'
        )
      `.as("auto_mode_count"),

      manual_mode_count: sql<number>`
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.mode = 'MANUAL'
          AND motors.status <> 'ARCHIVED'
        )
      `.as("manual_mode_count"),
    },
    with: {
      motors: {
        where: ne(motors.status, "ARCHIVED"),
        orderBy: [desc(motors.assigned_at)],
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true,
          alias_name: true,
          test_run_status: true,
        },
        with: {
          starter: {
            where: ne(starterBoxes.status, "ARCHIVED"),
            orderBy: [desc(starterBoxes.assigned_at)],
            columns: {
              id: true,
              mac_address: true,
              starter_number: true,
              pcb_number: true,
              power: true,
            },
          },
        },
      },
    },
  } as any);

  return {
    user,
    locations: {
      pagination_info: paginationInfo,
      locations_count: totalRecords,
      records: paginatedLocations,
    },
  };
}
