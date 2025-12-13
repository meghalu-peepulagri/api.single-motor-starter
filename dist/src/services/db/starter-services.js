import { and, asc, desc, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { locations } from "../../database/schemas/locations.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { getUTCFromDateAndToDate } from "../../helpers/dns-helpers.js";
import { buildAnalyticsFilter } from "../../helpers/motor-helper.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount, saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";
export async function addStarterWithTransaction(starterBoxPayload, userPayload) {
    const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
    await saveSingleRecord(starterBoxes, preparedStarerData);
}
export async function assignStarterWithTransaction(payload, userPayload, starterBoxPayload) {
    return await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx(starterBoxes, starterBoxPayload.id, {
            user_id: userPayload.id, device_status: "ASSIGNED", location_id: payload.location_id
        }, trx);
        await saveSingleRecord(motors, {
            name: payload.motor_name, hp: String(payload.hp), starter_id: starterBoxPayload.id,
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
export async function getStarterAnalytics(motorId, starterId, fromDate, toDate, parameter) {
    const { startOfDayUTC, endOfDayUTC } = getUTCFromDateAndToDate(fromDate, toDate);
    const { selectedFieldsMain } = buildAnalyticsFilter(parameter);
    const startOfDayDate = new Date(startOfDayUTC);
    const endOfDayDate = new Date(endOfDayUTC);
    return await db
        .select(selectedFieldsMain)
        .from(starterBoxParameters)
        .where(and(eq(starterBoxParameters.motor_id, motorId), eq(starterBoxParameters.starter_id, starterId), gte(starterBoxParameters.time_stamp, startOfDayDate.toISOString()), lte(starterBoxParameters.time_stamp, endOfDayDate.toISOString())))
        .orderBy(asc(starterBoxParameters.time_stamp));
}
;
