import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, or } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceRunTime } from "../../database/schemas/device-runtime.js";
import { locations } from "../../database/schemas/locations.js";
import { motors, type Motor, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { starterSettingsLimits, type StarterSettingsLimitsTable } from "../../database/schemas/starter-settings-limits.js";
import { starterSettings, type StarterSettingsTable } from "../../database/schemas/starter-settings.js";
import { users, type User } from "../../database/schemas/users.js";
import { getUTCFromDateAndToDate } from "../../helpers/dns-helpers.js";
import { buildAnalyticsFilter } from "../../helpers/motor-helper.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareHardWareVersion, prepareStmAtmelSettingsData } from "../../helpers/settings-helpers.js";
import { prepareStarterData } from "../../helpers/starter-helper.js";
import type { AssignStarterType, starterBoxPayloadType } from "../../types/app-types.js";
import type { OrderByQueryData } from "../../types/db-types.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount, getSingleRecordByAColumnValue, saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { getStarterDefaultSettings } from "./settings-services.js";


export async function addStarterWithTransaction(starterBoxPayload: starterBoxPayloadType,
  userPayload: User, externalTrx?: any
) {
  const preparedStarerData: any = prepareStarterData(starterBoxPayload, userPayload);
  const defaultSettings = await getStarterDefaultSettings();
  const { id, created_at, updated_at, ...defaultSettingsData } = defaultSettings[0];

  let createdStarter: StarterBox | null = null;
  let preparedSettingsData: any = null;
  let preparedHardwareData: any = null;

  const action = async (trx: any) => {
    const starter = await saveSingleRecord<StarterBoxTable>(starterBoxes, preparedStarerData, trx);
    await saveSingleRecord<MotorsTable>(motors, { ...preparedStarerData.motorDetails, starter_id: starter.id }, trx);

    const settings = await saveSingleRecord<StarterSettingsTable>(starterSettings,
      { starter_id: Number(starter.id), created_by: userPayload.id, acknowledgement: "TRUE", ...defaultSettingsData },
      trx
    );

    preparedSettingsData = prepareStmAtmelSettingsData(starter, settings);
    preparedHardwareData = prepareHardWareVersion(starter);
    await saveSingleRecord<StarterSettingsLimitsTable>(starterSettingsLimits, { starter_id: Number(starter.id) }, trx);

    createdStarter = starter;
    return starter;
  };

  const starter = externalTrx ? await action(externalTrx) : await db.transaction(action);
  if (!starter) return null;

  // if (preparedHardwareData) {
  //   publishMultipleTimesInBackground(preparedHardwareData, starter);
  // }

  // if (preparedSettingsData && starter.mac_address) {
  //   setImmediate(async () => {
  //     try {
  //       await publishMultipleTimesInBackground(preparedSettingsData, starter);
  //     } catch (error: any) {
  //       // TODO: Only logging for catch unnecessary improve
  //       logger.error(`[STARTER ADD] Background settings publish crashed starterId=${starter.id}`, error);
  //     }
  //   });
  // }

  return starter;
}


export async function assignStarterWithTransaction(payload: AssignStarterType, userPayload: User, starterBoxPayload: StarterBox, externalTrx?: any) {
  const assignedAt = new Date();
  const motorDetails = {
    alias_name: payload.motor_name, hp: String(payload.hp), starter_id: starterBoxPayload.id,
    location_id: payload.location_id, created_by: userPayload.id, assigned_at: assignedAt,
  }

  const existedMotorData = await getSingleRecordByAColumnValue<MotorsTable>(motors, "starter_id", "=", starterBoxPayload.id);

  const action = async (trx: any) => {
    const updatedStarter = await updateRecordById(starterBoxes, starterBoxPayload.id, {
      user_id: userPayload.id, device_status: "ASSIGNED", location_id: payload.location_id, assigned_at: assignedAt
    }, trx);

    const updatedMotor = existedMotorData
      ? (await trx.update(motors).set({ ...motorDetails }).where(eq(motors.id, existedMotorData.id)).returning())[0]
      : null;
    return { updatedStarter, updatedMotor };
  };

  if (externalTrx) {
    return await action(externalTrx);
  } else {
    return await db.transaction(action);
  }
}

export async function getStarterByMacWithMotor(mac: string) {
  const upperMac = mac.trim().toUpperCase();
  return await db.query.starterBoxes.findFirst({
    where: and(
      or(eq(starterBoxes.mac_address, upperMac), eq(starterBoxes.pcb_number, upperMac)),
      ne(starterBoxes.status, 'ARCHIVED')
    ),
    columns: {
      id: true,
      user_id: true,
      created_by: true,
      gateway_id: true,
      power: true,
      signal_quality: true,
      network_type: true
    },
    with: {
      motors: {
        where: ne(motors.status, 'ARCHIVED'),
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true,
          location_id: true,
          created_by: true
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
      device_status: true,
      signal_quality: true,
      network_type: true,
    },
    with: {
      user: {
        where: ne(users.status, "ARCHIVED"),
        columns: { id: true, full_name: true },
      },
      motors: {
        where: ne(motors.status, "ARCHIVED"),
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true,
          alias_name: true,
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
          alias_name: true,
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


export async function replaceStarterWithTransaction(motor: Motor, starter: StarterBox, locationId: number, externalTrx?: any) {
  const action = async (trx: any) => {
    const updatedMotor = await updateRecordById(motors, motor.id, { location_id: locationId }, trx);
    const updatedStarter = await updateRecordById(starterBoxes, starter.id, { location_id: locationId }, trx);
    return { updatedMotor, updatedStarter };
  };

  if (externalTrx) {
    return await action(externalTrx);
  } else {
    return await db.transaction(action);
  }
}

export async function getStarterAnalytics(starterId: number, fromDate: string, toDate: string, parameter: string, motorId?: number | undefined) {
  const { startOfDayUTC, endOfDayUTC } = getUTCFromDateAndToDate(fromDate, toDate);
  const { selectedFieldsMain } = buildAnalyticsFilter(parameter);

  const startOfDayDate = new Date(startOfDayUTC);
  const endOfDayDate = new Date(endOfDayUTC);

  const filters = [
    eq(starterBoxParameters.starter_id, starterId),
    gte(starterBoxParameters.time_stamp, startOfDayDate.toISOString()),
    lte(starterBoxParameters.time_stamp, endOfDayDate.toISOString()),
  ]

  if (motorId) filters.push(eq(starterBoxParameters.motor_id, +motorId))

  return await db
    .select(selectedFieldsMain)
    .from(starterBoxParameters)
    .where(and(...filters))
    .orderBy(asc(starterBoxParameters.time_stamp));
};


export async function getStarterRunTime(starterId: number, fromDate: string, toDate: string, motorId?: number, powerState?: string) {
  const filters = [
    eq(deviceRunTime.starter_box_id, starterId),
    gte(deviceRunTime.time_stamp, fromDate),
    lte(deviceRunTime.time_stamp, toDate),
  ];

  if (motorId) {
    filters.push(eq(deviceRunTime.motor_id, motorId));
  }

  if (powerState) {
    const powerStateNumber = powerState === "OFF" ? 0 : 1;
    filters.push(eq(deviceRunTime.power_state, powerStateNumber));
  }

  return await db.select({
    id: deviceRunTime.id,
    device_id: deviceRunTime.starter_box_id,
    start_time: deviceRunTime.start_time,
    end_time: deviceRunTime.end_time,
    duration: deviceRunTime.duration,
    power_state: deviceRunTime.power_state,
    time_stamp: deviceRunTime.time_stamp,
  })
    .from(deviceRunTime)
    .where(and(...filters))
    .orderBy(asc(deviceRunTime.start_time));
}

export async function assignStarterWebWithTransaction(starterDetails: StarterBox, requestBody: { user_id: number }, User: User, externalTrx?: any) {
  const existingMotor = await getSingleRecordByAColumnValue<MotorsTable>(motors, "starter_id", "=", starterDetails.id);
  const assignedAt = new Date();

  const action = async (trx: any) => {
    const updatedStarter = await updateRecordById(starterBoxes, starterDetails.id, { user_id: requestBody.user_id, device_status: "ASSIGNED", assigned_at: assignedAt }, trx);
    const updatedMotor = existingMotor
      ? await updateRecordById(motors, existingMotor.id, { created_by: requestBody.user_id, assigned_at: assignedAt }, trx)
      : null;
    return { updatedStarter, updatedMotor };
  };

  if (externalTrx) {
    return await action(externalTrx);
  } else {
    return await db.transaction(action);
  }
}
export async function starterConnectedMotors(starterId: number) {
  return await db.query.starterBoxes.findFirst({
    where: and(
      eq(starterBoxes.id, starterId),
      ne(starterBoxes.status, "ARCHIVED")
    ),
    columns: {
      id: true,
      name: true,
      mac_address: true,
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
          alias_name: true,
        },
      },
      location: {
        where: ne(locations.status, "ARCHIVED"),
        columns: {
          id: true,
          name: true,
        },
      },
    },
  } as any);
}

export async function getStarterByMac(mac: string) {
  return await db.query.starterBoxes.findFirst({
    where: and(
      eq(starterBoxes.mac_address, mac.trim().toUpperCase()),
      ne(starterBoxes.status, "ARCHIVED")
    ),
    columns: {
      id: true,
      name: true,
      mac_address: true,
      pcb_number: true,
      starter_number: true,
      power: true,
      signal_quality: true,
      network_type: true,
    },
  });
}

export async function findStarterByPcbOrStarterNumber(key: string) {
  if (!key || typeof key !== "string") {
    return null;
  }

  const searchTerm = key.trim().toUpperCase();
  return await db.query.starterBoxes.findFirst({
    where: and(
      or(
        eq(starterBoxes.pcb_number, searchTerm),
        eq(starterBoxes.starter_number, searchTerm),
      ),
      ne(starterBoxes.status, "ARCHIVED")
    ),
  });
}

export async function getUniqueStarterIdsWithInTime(time: any) {
  const result = await db.selectDistinct({
    starterId: starterBoxParameters.starter_id,
  })
    .from(starterBoxParameters)
    .where(
      gte(starterBoxParameters.time_stamp, time.toISOString()),
    );
  return result.map(row => row.starterId) || [];
};

export async function updateStarterStatus(starterIds: number[]) {
  const inActiveStarterIds = await db.update(starterBoxes)
    .set({ status: "INACTIVE", signal_quality: 0 })
    .where(
      and(
        notInArray(starterBoxes.id, starterIds),
        eq(starterBoxes.status, "ACTIVE"),
      ),
    )
    .returning({ id: starterBoxes.id });

  const activeStarterIds = await db.update(starterBoxes)
    .set({ status: "ACTIVE", signal_quality: 10 })
    .where(
      and(
        inArray(starterBoxes.id, starterIds),
        eq(starterBoxes.status, "INACTIVE"),
      ),
    )
    .returning({ id: starterBoxes.id });

  return {
    inactiveStarterIds: inActiveStarterIds.map(row => row.id),
    activeStarterIds: activeStarterIds.map(row => row.id),
  };
};

