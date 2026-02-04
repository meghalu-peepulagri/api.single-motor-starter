import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, or } from "drizzle-orm";
import db from "../../database/configuration.js";
import { benchedStarterParameters } from "../../database/schemas/benched-starter-parameters.js";
import { deviceRunTime } from "../../database/schemas/device-runtime.js";
import { locations } from "../../database/schemas/locations.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { starterSettingsLimits } from "../../database/schemas/starter-settings-limits.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { users } from "../../database/schemas/users.js";
import { getUTCFromDateAndToDate } from "../../helpers/dns-helpers.js";
import { buildAnalyticsFilter, formatAnalyticsData } from "../../helpers/motor-helper.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareStarterData } from "../../helpers/starter-helper.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount, getSingleRecordByAColumnValue, saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { getStarterDefaultSettings } from "./settings-services.js";
export async function addStarterWithTransaction(starterBoxPayload, userPayload) {
    const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
    const defaultSettings = await getStarterDefaultSettings();
    const { id, created_at, updated_at, ...defaultSettingsData } = defaultSettings[0];
    await db.transaction(async (trx) => {
        const starter = await saveSingleRecord(starterBoxes, preparedStarerData, trx);
        await saveSingleRecord(motors, { ...preparedStarerData.motorDetails, starter_id: starter.id }, trx);
        await saveSingleRecord(starterSettings, { starter_id: Number(starter.id), created_by: userPayload.id, acknowledgement: "TRUE", ...defaultSettingsData }, trx);
        await saveSingleRecord(starterSettingsLimits, { starter_id: Number(starter.id) }, trx);
        return starter;
    });
}
export async function assignStarterWithTransaction(payload, userPayload, starterBoxPayload, externalTrx) {
    const assignedAt = new Date();
    const motorDetails = {
        alias_name: payload.motor_name, hp: String(payload.hp), starter_id: starterBoxPayload.id,
        location_id: payload.location_id, created_by: userPayload.id, assigned_at: assignedAt,
    };
    const existedMotorData = await getSingleRecordByAColumnValue(motors, "starter_id", "=", starterBoxPayload.id);
    const action = async (trx) => {
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
    }
    else {
        return await db.transaction(action);
    }
}
export async function getStarterByMacWithMotor(mac) {
    const upperMac = mac.trim().toUpperCase();
    return await db.query.starterBoxes.findFirst({
        where: and(or(eq(starterBoxes.mac_address, upperMac), eq(starterBoxes.pcb_number, upperMac)), ne(starterBoxes.status, 'ARCHIVED')),
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
export async function paginatedStarterList(WhereQueryData, orderByQueryData, pageParams) {
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
    });
    const totalRecords = await getRecordsCount(starterBoxes, WhereQueryData || []);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return {
        pagination_info: pagination,
        records: starterList,
    };
}
export async function paginatedStarterListForMobile(WhereQueryData, orderByQueryData, pageParams) {
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
                    test_run_status: true,
                },
                with: {
                    location: {
                        where: ne(locations.status, "ARCHIVED"),
                        columns: { id: true, name: true },
                    },
                },
            },
        },
    });
    const totalRecords = await getRecordsCount(starterBoxes, WhereQueryData || []);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return {
        pagination_info: pagination,
        records: starterList,
    };
}
export async function replaceStarterWithTransaction(motor, starter, locationId) {
    const action = async (trx) => {
        const updatedMotor = await updateRecordById(motors, motor.id, { location_id: locationId }, trx);
        const updatedStarter = await updateRecordById(starterBoxes, starter.id, { location_id: locationId }, trx);
        return { updatedMotor, updatedStarter };
    };
    return await db.transaction(action);
}
export async function getStarterAnalytics(starterId, fromDate, toDate, parameter, motorId) {
    const { startOfDayUTC, endOfDayUTC } = getUTCFromDateAndToDate(fromDate, toDate);
    const { selectedFieldsMain, selectedFieldsBench } = buildAnalyticsFilter(parameter);
    const startOfDayDate = new Date(startOfDayUTC);
    const endOfDayDate = new Date(endOfDayUTC);
    // Build filters for main table
    const filtersMain = [
        eq(starterBoxParameters.starter_id, starterId),
        gte(starterBoxParameters.time_stamp, startOfDayDate.toISOString()),
        lte(starterBoxParameters.time_stamp, endOfDayDate.toISOString()),
    ];
    // Build filters for benched table
    const filtersBench = [
        eq(benchedStarterParameters.starter_id, starterId),
        gte(benchedStarterParameters.time_stamp, startOfDayDate.toISOString()),
        lte(benchedStarterParameters.time_stamp, endOfDayDate.toISOString()),
    ];
    if (motorId) {
        filtersMain.push(eq(starterBoxParameters.motor_id, +motorId));
        filtersBench.push(eq(benchedStarterParameters.motor_id, +motorId));
    }
    const data = await db
        .select(selectedFieldsMain)
        .from(starterBoxParameters)
        .where(and(...filtersMain))
        .unionAll(db
        .select(selectedFieldsBench)
        .from(benchedStarterParameters)
        .where(and(...filtersBench)))
        .orderBy(asc(starterBoxParameters.time_stamp));
    return formatAnalyticsData(data, parameter);
}
export async function getStarterRunTime(starterId, fromDate, toDate, motorId, powerState) {
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
export async function assignStarterWebWithTransaction(starterDetails, requestBody) {
    const existingMotor = await getSingleRecordByAColumnValue(motors, "starter_id", "=", starterDetails.id);
    const assignedAt = new Date();
    const action = async (trx) => {
        const updatedStarter = await updateRecordById(starterBoxes, starterDetails.id, { user_id: requestBody.user_id, device_status: "ASSIGNED", assigned_at: assignedAt }, trx);
        const updatedMotor = existingMotor ? await updateRecordById(motors, existingMotor.id, { created_by: requestBody.user_id, assigned_at: assignedAt }, trx) : null;
        return { updatedStarter, updatedMotor };
    };
    return await db.transaction(action);
}
export async function starterConnectedMotors(starterId) {
    return await db.query.starterBoxes.findFirst({
        where: and(eq(starterBoxes.id, starterId), ne(starterBoxes.status, "ARCHIVED")),
        columns: {
            id: true,
            name: true,
            mac_address: true,
            pcb_number: true,
            starter_number: true,
            power: true,
            signal_quality: true,
            network_type: true,
            device_status: true,
            assigned_at: true,
            deployed_at: true,
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
    });
}
export async function getStarterByMac(mac) {
    return await db.query.starterBoxes.findFirst({
        where: and(eq(starterBoxes.mac_address, mac.trim().toUpperCase()), ne(starterBoxes.status, "ARCHIVED")),
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
export async function findStarterByPcbOrStarterNumber(key) {
    if (!key || typeof key !== "string") {
        return null;
    }
    const searchTerm = key.trim().toUpperCase();
    return await db.query.starterBoxes.findFirst({
        where: and(or(eq(starterBoxes.pcb_number, searchTerm), eq(starterBoxes.starter_number, searchTerm)), ne(starterBoxes.status, "ARCHIVED")),
    });
}
export async function getUniqueStarterIdsWithInTime(time) {
    const result = await db.selectDistinct({
        starterId: starterBoxParameters.starter_id,
    })
        .from(starterBoxParameters)
        .where(gte(starterBoxParameters.time_stamp, time.toISOString()));
    return result.map(row => row.starterId) || [];
}
;
export async function updateStarterStatus(starterIds) {
    const inActiveStarterIds = await db.update(starterBoxes)
        .set({ status: "INACTIVE", signal_quality: 0 })
        .where(and(notInArray(starterBoxes.id, starterIds), eq(starterBoxes.status, "ACTIVE")))
        .returning({ id: starterBoxes.id });
    const activeStarterIds = await db.update(starterBoxes)
        .set({ status: "ACTIVE", signal_quality: 10 })
        .where(and(inArray(starterBoxes.id, starterIds), eq(starterBoxes.status, "INACTIVE")))
        .returning({ id: starterBoxes.id });
    return {
        inactiveStarterIds: inActiveStarterIds.map(row => row.id),
        activeStarterIds: activeStarterIds.map(row => row.id),
    };
}
;
