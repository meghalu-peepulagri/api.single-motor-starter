import { and, eq, ne, isNotNull, desc } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import type { User } from "../../database/schemas/users.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import type { AssignStarterType, starterBoxPayloadType } from "../../types/app-types.js";
import { getRecordsCount, saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";
import type { OrderByQueryData, WhereQueryDataWithOr } from "../../types/db-types.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import { locations } from "../../database/schemas/locations.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";


export async function addStarterWithTransaction(starterBoxPayload: starterBoxPayloadType, userPayload: User) {
  const preparedStarerData: any = prepareStarterData(starterBoxPayload, userPayload);
  await saveSingleRecord<StarterBoxTable>(starterBoxes, preparedStarerData);
}

export async function assignStarterWithTransaction(payload: AssignStarterType, userPayload: User, starterBoxPayload: StarterBox) {
  return await db.transaction(async (trx) => {
    await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starterBoxPayload.id, {
      user_id: userPayload.id, device_status: "ASSIGNED", location_id: payload.location_id
    }, trx);
    await saveSingleRecord<MotorsTable>(motors, {
      name: payload.motor_name, hp: String(payload.hp), starter_id: starterBoxPayload.id,
      location_id: payload.location_id, created_by: userPayload.id,
    }, trx);
  });
}

export async function getStarterByMacWithMotor(mac: string) {
  return await db.query.starterBoxes.findFirst({
    where: and(
      eq(starterBoxes.mac_address, mac.trim().toUpperCase()),
      ne(starterBoxes.status, 'ARCHIVED')
    ),
    columns: {
      id: true,
      created_by: true,
      gateway_id: true,
      power: true,
      signal_quality: true,
      network_type: true
    },
    with: {
      motors: {
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true
        },
      },
    },
  });
}

export async function paginatedStarterList(
  WhereQueryData: any,
  orderByQueryData: OrderByQueryData<StarterBoxTable>,
  pageParams: { page: number; pageSize: number; offset: number }
) {
  const whereQuery = WhereQueryData?.length ? and(...WhereQueryData) : undefined;
  const orderQuery = prepareOrderByQueryConditions(starterBoxes, orderByQueryData);

  const starterList = await db.query.starterBoxes.findMany({
    where: whereQuery,
    orderBy: orderQuery,
    limit: pageParams.pageSize,
    offset: pageParams.offset,
    columns: {
      id: true,
      name: true,
      mac_address: true,
      pcb_number: true,
      starter_number: true,
      power: true,
      signal_quality: true,
      network_type: true,
      user_id: true,
    },
    with: {
      motors: {
        where: ne(motors.status, "ARCHIVED"),
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true,
        },
        with: {
          location: {
            where: ne(locations.status, "ARCHIVED"),
            columns: { id: true, name: true },
          },
          starterParameters: {
            where: isNotNull(starterBoxParameters.time_stamp),
            orderBy: [desc(starterBoxParameters.time_stamp)],
            limit: 1,
            columns: {
              id: true,
              line_voltage_r: true,
              line_voltage_y: true,
              line_voltage_b: true,
              current_r: true,
              current_y: true,
              current_b: true,
              time_stamp: true,
            },
          },
        },
      },
    },
  } as any);

  const totalRecords = await getRecordsCount(starterBoxes, WhereQueryData || []);
  const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);

  return {
    pagination_info: pagination,
    records: starterList,
  };
}

export async function paginatedStarterListForMobile(WhereQueryData: any, orderByQueryData: OrderByQueryData<StarterBoxTable>,
  pageParams: { page: number; pageSize: number; offset: number }
) {
  const whereQuery = WhereQueryData?.length ? and(...WhereQueryData) : undefined;
  const orderQuery = prepareOrderByQueryConditions(starterBoxes, orderByQueryData);

  const starterList = await db.query.starterBoxes.findMany({
    where: whereQuery,
    orderBy: orderQuery,
    limit: pageParams.pageSize,
    offset: pageParams.offset,
    columns: {
      id: true,
      name: true,
      pcb_number: true,
      starter_number: true,
      power: true,
      signal_quality: true,
      network_type: true,
    },
    with: {
      motors: {
        where: ne(motors.status, "ARCHIVED"),
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true,
        },
        with: {
          location: {
            where: ne(locations.status, "ARCHIVED"),
            columns: { id: true, name: true },
          },
        },
      },
    },
  } as any);

  const totalRecords = await getRecordsCount(starterBoxes, WhereQueryData || []);
  const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);

  return {
    pagination_info: pagination,
    records: starterList,
  };
}