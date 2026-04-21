import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import db from "../../database/configuration.js";
import { benchedStarterParameters } from "../../database/schemas/benched-starter-parameters.js";
import { deviceRunTime } from "../../database/schemas/device-runtime.js";
import { locations } from "../../database/schemas/locations.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterDispatch } from "../../database/schemas/starter-dispatch.js";
import { StarterDefaultSettingsLimits } from "../../database/schemas/starter-default-settings-limits.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { starterSettingsLimits } from "../../database/schemas/starter-settings-limits.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { users } from "../../database/schemas/users.js";
import { formatDuration, getUTCFromDateAndToDate, parseDurationToSeconds } from "../../helpers/dns-helpers.js";
import { buildAnalyticsFilter, formatAnalyticsData } from "../../helpers/motor-helper.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareStarterData } from "../../helpers/starter-helper.js";
import { splitRuntimeRecordsByDate } from "../../helpers/runtime-date-split-helper.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { getRecordsCount, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { ActivityService } from "./activity-service.js";
import { getStarterDefaultSettings } from "./settings-services.js";
import { publishMultipleTimesInBackground } from "../../helpers/settings-helpers.js";
import { randomSequenceNumber } from "../../helpers/mqtt-helpers.js";
import { gateways } from "../../database/schemas/gateways.js";
export async function addStarterWithTransaction(starterBoxPayload, userPayload, gatewayId) {
    const existedStarterDispatch = await getSingleRecordByMultipleColumnValues(starterDispatch, ["box_serial_no", "status"], ["=", "!="], [starterBoxPayload.starter_number, "ARCHIVED"]);
    const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload, existedStarterDispatch, gatewayId);
    const defaultSettings = await getStarterDefaultSettings();
    const { id, created_at, updated_at, ...defaultSettingsData } = defaultSettings[0];
    const defaultSettingsLimitsData = await db.select().from(StarterDefaultSettingsLimits).limit(1);
    const { id: starterSettingsLimitsId, created_at: starterSettingsLimitsCreatedAt, updated_at: starterSettingsLimitsUpdatedAt, ...restDefaultSettingsLimitsData } = defaultSettingsLimitsData[0];
    return await db.transaction(async (trx) => {
        const starter = await saveSingleRecord(starterBoxes, preparedStarerData, trx);
        await saveSingleRecord(motors, { ...preparedStarerData.motorDetails, starter_id: starter.id }, trx);
        await saveSingleRecord(starterSettings, { ...defaultSettingsData, starter_id: Number(starter.id), created_by: userPayload.id, acknowledgement: "TRUE" }, trx);
        await trx.update(starterDispatch).set({ starter_id: starter.id }).where(and(eq(starterDispatch.box_serial_no, preparedStarerData.starter_number), isNull(starterDispatch.starter_id)));
        await saveSingleRecord(starterSettingsLimits, { ...restDefaultSettingsLimitsData, starter_id: starter.id }, trx);
        const deviceInfoPayload = { T: 10, S: randomSequenceNumber(), D: 1 };
        publishMultipleTimesInBackground(deviceInfoPayload, starter);
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
        const starterUpdateData = {
            user_id: userPayload.id, device_status: "ASSIGNED", location_id: payload.location_id, assigned_at: assignedAt,
            device_installed_location: payload.device_installed_location
        };
        if (payload.installation_photo_key) {
            starterUpdateData.installation_photo_key = payload.installation_photo_key;
        }
        const updatedStarter = await updateRecordById(starterBoxes, starterBoxPayload.id, starterUpdateData, trx);
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
            network_type: true,
            synced_settings_status: true,
            device_status: true,
            mac_address: true,
            pcb_number: true,
            device_reset_status: true,
            device_allocation: true,
            allocation_status_count: true,
            starter_number: true,
            hardware_version: true,
            sim_recharge_expires_at: true,
            device_mobile_number: true,
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
                    created_by: true,
                    alias_name: true,
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
            device_mobile_number: true,
        },
        with: {
            gateway: {
                where: ne(gateways.status, "ARCHIVED"),
                columns: { id: true, name: true, mac_address: true, pcb_number: true },
            },
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
                    test_run_status: true,
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
            mac_address: true,
            pcb_number: true,
            starter_number: true,
            power: true,
            signal_quality: true,
            network_type: true,
            device_allocation: true,
            sim_recharge_expires_at: true,
            device_mobile_number: true,
            device_installed_location: true,
            installation_photo_key: true,
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
                    test_run_completed_at: true,
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
export async function getStarterRunTime(starterId, fromDate, toDate, motorId, powerState, isSingleDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const filters = [
        eq(deviceRunTime.starter_box_id, starterId),
        lte(deviceRunTime.start_time, to),
        or(gte(deviceRunTime.end_time, from), isNull(deviceRunTime.end_time)),
    ];
    if (motorId) {
        filters.push(eq(deviceRunTime.motor_id, motorId));
    }
    if (powerState) {
        const powerStateNumber = powerState === "OFF" ? 0 : 1;
        filters.push(eq(deviceRunTime.power_state, powerStateNumber));
    }
    const records = await db.select({
        id: deviceRunTime.id,
        device_id: deviceRunTime.starter_box_id,
        start_time: deviceRunTime.start_time,
        end_time: deviceRunTime.end_time,
        duration: deviceRunTime.duration,
        power_state: deviceRunTime.power_state,
        time_stamp: deviceRunTime.time_stamp,
        motor_state: deviceRunTime.motor_state,
    })
        .from(deviceRunTime)
        .where(and(...filters))
        .orderBy(asc(deviceRunTime.start_time));
    // Clamp records to the requested date range and split cross-midnight records
    const runtimeRecords = records.map((record) => ({
        id: record.id,
        start_time: record.start_time,
        end_time: record.end_time,
        duration: record.duration,
        time_stamp: record.time_stamp,
        motor_state: record.motor_state ?? null,
        power_start: null,
        power_end: null,
        power_duration: null,
        power_state: record.power_state ?? null,
    }));
    const splitRecords = splitRuntimeRecordsByDate(runtimeRecords, from, to);
    const deviceIdById = new Map(records.map((record) => [record.id, record.device_id]));
    const totalOnSeconds = splitRecords.reduce((sum, record) => {
        if ((!powerState && record.power_state !== 1) || !record.duration)
            return sum;
        return sum + parseDurationToSeconds(record.duration);
    }, 0);
    const mappedSplit = splitRecords.map((record) => ({
        id: record.id,
        device_id: deviceIdById.get(record.id),
        start_time: record.start_time,
        end_time: record.end_time,
        duration: record.duration,
        power_state: record.power_state,
        time_stamp: record.time_stamp,
    }));
    return {
        total_run_on_time: formatDuration(totalOnSeconds * 1000),
        records: mappedSplit,
    };
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
            device_allocation: true,
            device_mobile_number: true,
            synced_settings_status: true,
            allocation_status_count: true,
            device_reset_status: true,
            sim_recharge_expires_at: true,
            hardware_version: true,
            installation_photo_key: true,
            device_installed_location: true,
            warranty_expiry_date: true,
        },
        with: {
            gateway: {
                where: ne(gateways.status, "ARCHIVED"),
                columns: {
                    id: true,
                    name: true,
                    mac_address: true,
                    pcb_number: true,
                },
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
                    test_run_completed_at: true,
                },
            },
            location: {
                where: ne(locations.status, "ARCHIVED"),
                columns: {
                    id: true,
                    name: true,
                },
            },
            createdBy: {
                where: ne(users.status, "ARCHIVED"),
                columns: {
                    id: true,
                    full_name: true,
                },
            },
            dispatch: {
                where: ne(starterDispatch.status, "ARCHIVED"),
                columns: {
                    invoice_document: true,
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
export async function getStartersWithSimRechargeExpiry() {
    return await db.select({
        id: starterBoxes.id,
        starter_number: starterBoxes.starter_number,
        sim_recharge_expires_at: starterBoxes.sim_recharge_expires_at,
        mac_address: starterBoxes.mac_address,
        pcb_number: starterBoxes.pcb_number,
        device_allocation: starterBoxes.device_allocation,
        motor_alias_name: motors.alias_name,
        motor_created_by: motors.created_by,
        created_by: starterBoxes.created_by,
        motor_id: motors.id,
    }).from(starterBoxes)
        .leftJoin(motors, and(eq(motors.starter_id, starterBoxes.id), ne(motors.status, "ARCHIVED")))
        .where(and(ne(starterBoxes.status, "ARCHIVED"), isNotNull(starterBoxes.sim_recharge_expires_at)));
}
/**
 * Shared device allocation handler — uses SELECT FOR UPDATE to prevent
 * duplicate logs when frontend API and MQTT ack race each other.
 * Returns true if allocation was actually changed, false if already in target state.
 */
export async function applyDeviceAllocation(starterId, newAllocation, userId) {
    return await db.transaction(async (trx) => {
        // Lock the row to prevent race between API and MQTT ack
        const [latestStarter] = await trx
            .select({
            device_allocation: starterBoxes.device_allocation,
            allocation_status_count: starterBoxes.allocation_status_count,
        })
            .from(starterBoxes)
            .where(and(eq(starterBoxes.id, starterId), ne(starterBoxes.status, "ARCHIVED")))
            .for("update");
        if (!latestStarter || latestStarter.device_allocation === newAllocation)
            return false;
        const previousAllocation = latestStarter.device_allocation ?? "false";
        const currentCount = latestStarter.allocation_status_count ?? 0;
        const newCount = (newAllocation === "true" && previousAllocation === "false") ? currentCount + 1 : currentCount;
        let allocationAction;
        let messageLog;
        if (previousAllocation === "false" && newAllocation === "true") {
            allocationAction = newCount === 1 ? "DEVICE_ALLOCATED" : "DEVICE_REALLOCATED";
            messageLog = newCount === 1 ? "Device Allocated" : "Device Reallocated";
        }
        else {
            allocationAction = "DEVICE_DEALLOCATED";
            messageLog = "Device Deallocated";
        }
        await updateRecordByIdWithTrx(starterBoxes, starterId, { device_allocation: newAllocation, allocation_status_count: newCount }, trx);
        await ActivityService.writeDeviceAllocationLog(userId, starterId, allocationAction, { device_allocation: previousAllocation, allocation_status_count: currentCount }, { device_allocation: newAllocation, allocation_status_count: newCount }, messageLog, trx);
        return true;
    });
}
export async function getDeviceWithDispatchDetails(search) {
    return await db.query.starterBoxes.findFirst({
        where: or(ilike(starterBoxes.starter_number, `%${search}%`), ilike(starterBoxes.mac_address, `%${search}%`), ilike(starterBoxes.pcb_number, `%${search}%`), ne(starterBoxes.status, "ARCHIVED")),
        columns: {
            id: true,
            starter_number: true,
            mac_address: true,
            pcb_number: true,
        },
        with: {
            dispatch: {
                where: ne(starterDispatch.status, "ARCHIVED"),
                columns: {
                    id: true,
                    box_serial_no: true,
                },
            },
        },
    });
}
