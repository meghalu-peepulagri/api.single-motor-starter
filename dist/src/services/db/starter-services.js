import { and, asc, desc, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceRunTime } from "../../database/schemas/device-runtime.js";
import { locations } from "../../database/schemas/locations.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { users } from "../../database/schemas/users.js";
import { getUTCFromDateAndToDate } from "../../helpers/dns-helpers.js";
import { buildAnalyticsFilter } from "../../helpers/motor-helper.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount, saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";
export async function addStarterWithTransaction(starterBoxPayload, userPayload) {
    const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
    await db.transaction(async (trx) => {
        const starter = await saveSingleRecord(starterBoxes, preparedStarerData, trx);
        await saveSingleRecord(motors, { ...preparedStarerData.motorDetails, starter_id: starter.id }, trx);
    });
}
export async function assignStarterWithTransaction(payload, userPayload, starterBoxPayload) {
    return await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(starterBoxes, starterBoxPayload.id, {
            user_id: userPayload.id, device_status: "ASSIGNED", location_id: payload.location_id
        }, trx);
        await updateRecordByIdWithTrx(motors, payload.motor_id, {
            alias_name: payload.motor_name, hp: String(payload.hp), starter_id: starterBoxPayload.id,
            location_id: payload.location_id, created_by: userPayload.id,
        }, trx);
    });
}
export async function getStarterByMacWithMotor(mac) {
    return await db.query.starterBoxes.findFirst({
        where: and(eq(starterBoxes.mac_address, mac.trim().toUpperCase()), ne(starterBoxes.status, 'ARCHIVED')),
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
    return await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(motors, motor.id, { location_id: locationId }, trx);
        await updateRecordByIdWithTrx(starterBoxes, starter.id, { location_id: locationId }, trx);
    });
}
export async function getStarterAnalytics(starterId, fromDate, toDate, parameter, motorId) {
    const { startOfDayUTC, endOfDayUTC } = getUTCFromDateAndToDate(fromDate, toDate);
    const { selectedFieldsMain } = buildAnalyticsFilter(parameter);
    const startOfDayDate = new Date(startOfDayUTC);
    const endOfDayDate = new Date(endOfDayUTC);
    const filters = [
        eq(starterBoxParameters.starter_id, starterId),
        gte(starterBoxParameters.time_stamp, startOfDayDate.toISOString()),
        lte(starterBoxParameters.time_stamp, endOfDayDate.toISOString()),
    ];
    if (motorId)
        filters.push(eq(starterBoxParameters.motor_id, +motorId));
    return await db
        .select(selectedFieldsMain)
        .from(starterBoxParameters)
        .where(and(...filters))
        .orderBy(asc(starterBoxParameters.time_stamp));
}
;
export async function getStarterRunTime(starterId, fromDate, toDate, motorId, powerState) {
    const filters = [
        eq(deviceRunTime.starter_box_id, starterId),
        gte(deviceRunTime.start_time, new Date(fromDate)),
        lte(deviceRunTime.end_time, new Date(toDate)),
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
export async function assignStarterWebWithTransaction(starterDetails, requestBody, User) {
    return await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(starterBoxes, starterDetails.id, { user_id: requestBody.user_id, device_status: "ASSIGNED" }, trx);
    });
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
