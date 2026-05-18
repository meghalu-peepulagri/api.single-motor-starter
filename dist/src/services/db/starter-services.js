import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
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
        if (preparedStarerData.motorDetails)
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
            status: true,
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
            starter_type: true,
            role: true,
            parent_starter_id: true,
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
                    motor_reference: true,
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
            starter_type: true,
            role: true,
            parent_starter_id: true,
        },
        with: {
            gateway: {
                where: ne(gateways.status, "ARCHIVED"),
                columns: { id: true, name: true, mac_address: true, pcb_number: true },
            },
            parent: {
                columns: { id: true, name: true, starter_number: true, mac_address: true, role: true },
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
                    motor_reference: true,
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
            role: true,
            parent_starter_id: true,
        },
        with: {
            parent: {
                columns: { id: true, name: true, starter_number: true, mac_address: true, role: true },
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
export async function getStarterAnalytics(starterId, fromDate, toDate, parameter, motorId, motorReference) {
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
    else if (motorReference) {
        filtersMain.push(eq(starterBoxParameters.motor_reference, motorReference));
        filtersBench.push(eq(benchedStarterParameters.motor_reference, motorReference));
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
export async function getBasicStarterDetails(pageParams, search) {
    const trimmedSearch = search?.trim();
    const whereCondition = and(ne(starterBoxes.status, "ARCHIVED"), ...(trimmedSearch ? [or(ilike(starterBoxes.starter_number, `%${trimmedSearch}%`), ilike(starterBoxes.pcb_number, `%${trimmedSearch}%`), ilike(starterBoxes.mac_address, `%${trimmedSearch}%`))] : []));
    const records = await db.query.starterBoxes.findMany({
        where: whereCondition,
        columns: {
            id: true,
            starter_number: true,
            pcb_number: true,
            mac_address: true,
            device_allocation: true,
        },
        with: {
            motors: {
                where: ne(motors.status, "ARCHIVED"),
                columns: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: [desc(starterBoxes.created_at)],
        limit: pageParams.pageSize,
        offset: pageParams.offset,
    });
    const totalFilters = [ne(starterBoxes.status, "ARCHIVED")];
    if (trimmedSearch) {
        totalFilters.push(or(ilike(starterBoxes.starter_number, `%${trimmedSearch}%`), ilike(starterBoxes.pcb_number, `%${trimmedSearch}%`), ilike(starterBoxes.mac_address, `%${trimmedSearch}%`)));
    }
    const totalRecords = await getRecordsCount(starterBoxes, totalFilters);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return {
        pagination_info: pagination,
        records,
    };
}
export async function getStarterById(id) {
    return await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [id, "ARCHIVED"]);
}
/**
 * Cross-field validation for role + parent_starter_id.
 * Throws caller-supplied exceptions; returns nothing on success.
 */
export async function resolveAndValidateParent(role, parentStarterId, selfId) {
    if (role !== "CHILD") {
        return { parent: null };
    }
    if (!parentStarterId) {
        throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).PARENT_REQUIRED_FOR_CHILD);
    }
    if (selfId && parentStarterId === selfId) {
        throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).CANNOT_PARENT_SELF);
    }
    const parent = await getStarterById(parentStarterId);
    if (!parent) {
        throw new (await import("../../exceptions/not-found-exception.js")).default((await import("../../constants/app-constants.js")).PARENT_NOT_FOUND);
    }
    if (parent.role !== "MASTER") {
        throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).PARENT_MUST_BE_MASTER);
    }
    return { parent };
}
export async function getChildrenOfStarter(masterId) {
    return await db.query.starterBoxes.findMany({
        where: and(eq(starterBoxes.parent_starter_id, masterId), ne(starterBoxes.status, "ARCHIVED")),
        columns: {
            id: true,
            name: true,
            role: true,
            mac_address: true,
            pcb_number: true,
            starter_number: true,
            power: true,
            signal_quality: true,
            device_status: true,
            status: true,
            last_signal_received_at: true,
            parent_starter_id: true,
        },
        with: {
            motors: {
                where: ne(motors.status, "ARCHIVED"),
                columns: {
                    id: true,
                    name: true,
                    alias_name: true,
                    hp: true,
                    state: true,
                    mode: true,
                },
            },
        },
        orderBy: [asc(starterBoxes.id)],
    });
}
export async function countChildrenOfMaster(masterId) {
    return await getRecordsCount(starterBoxes, [
        eq(starterBoxes.parent_starter_id, masterId),
        ne(starterBoxes.status, "ARCHIVED"),
    ]);
}
/**
 * Topic-resolution helper: find a MASTER row whose mac_address or pcb_number
 * matches the given (case-insensitive) identifier from the MQTT topic.
 * Returns null if no live MASTER matches.
 */
export async function findMasterByIdentifier(identifier) {
    if (!identifier)
        return null;
    const upper = identifier.trim().toUpperCase();
    return await db.query.starterBoxes.findFirst({
        where: and(or(eq(starterBoxes.mac_address, upper), eq(starterBoxes.pcb_number, upper)), eq(starterBoxes.role, "MASTER"), ne(starterBoxes.status, "ARCHIVED")),
    });
}
/**
 * Topic-resolution helper: find a CHILD row that:
 *   - matches mac_address or pcb_number
 *   - has role = CHILD
 *   - is parented by the given master id
 * Returns null if no matching child belongs to THIS master.
 */
export async function findChildOfMasterByIdentifier(masterId, identifier) {
    if (!identifier || !masterId)
        return null;
    const upper = identifier.trim().toUpperCase();
    return await db.query.starterBoxes.findFirst({
        where: and(or(eq(starterBoxes.mac_address, upper), eq(starterBoxes.pcb_number, upper)), eq(starterBoxes.role, "CHILD"), eq(starterBoxes.parent_starter_id, masterId), ne(starterBoxes.status, "ARCHIVED")),
    });
}
export async function getMasterIdentifierById(masterId) {
    const master = await db.query.starterBoxes.findFirst({
        where: and(eq(starterBoxes.id, masterId), ne(starterBoxes.status, "ARCHIVED")),
        columns: { mac_address: true, pcb_number: true, device_allocation: true },
    });
    if (!master)
        return null;
    return master.device_allocation === "false" ? master.mac_address : master.pcb_number;
}
export async function getUnassignedMasters(pageParams, search) {
    const baseFilters = [
        eq(starterBoxes.role, "MASTER"),
        ne(starterBoxes.status, "ARCHIVED"),
        isNull(starterBoxes.user_id),
    ];
    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
        const s = `%${trimmedSearch}%`;
        baseFilters.push(or(ilike(starterBoxes.starter_number, s), ilike(starterBoxes.mac_address, s), ilike(starterBoxes.pcb_number, s)));
    }
    const whereCondition = and(...baseFilters);
    const records = await db.select({
        id: starterBoxes.id,
        mac_address: starterBoxes.mac_address,
        pcb_number: starterBoxes.pcb_number,
        starter_number: starterBoxes.starter_number,
    })
        .from(starterBoxes)
        .where(whereCondition)
        .orderBy(desc(starterBoxes.created_at))
        .limit(pageParams.pageSize)
        .offset(pageParams.offset);
    const totalRecords = await getRecordsCount(starterBoxes, baseFilters);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return { pagination_info: pagination, records };
}
export async function getEligibleParents(query) {
    const filters = [
        eq(starterBoxes.role, "MASTER"),
        ne(starterBoxes.status, "ARCHIVED"),
    ];
    if (query.user_id)
        filters.push(eq(starterBoxes.user_id, Number(query.user_id)));
    if (query.location_id)
        filters.push(eq(starterBoxes.location_id, Number(query.location_id)));
    if (query.search?.trim()) {
        const s = `%${query.search.trim()}%`;
        filters.push(or(ilike(starterBoxes.starter_number, s), ilike(starterBoxes.pcb_number, s), ilike(starterBoxes.mac_address, s), ilike(starterBoxes.name, s)));
    }
    return await db.query.starterBoxes.findMany({
        where: and(...filters),
        columns: {
            id: true,
            name: true,
            role: true,
            mac_address: true,
            pcb_number: true,
            starter_number: true,
            device_status: true,
        },
        orderBy: [desc(starterBoxes.created_at)],
        limit: 50,
    });
}
/**
 * Returns a nested tree of starters. Roots = devices with no parent_starter_id
 * (STANDALONE or MASTER); children are nested under their parent_starter_id.
 */
export async function getTopologyTree(query) {
    const filters = [ne(starterBoxes.status, "ARCHIVED")];
    if (query.user_id)
        filters.push(eq(starterBoxes.user_id, Number(query.user_id)));
    if (query.location_id)
        filters.push(eq(starterBoxes.location_id, Number(query.location_id)));
    if (query.status)
        filters.push(eq(starterBoxes.status, query.status));
    const rows = await db.query.starterBoxes.findMany({
        where: and(...filters),
        columns: {
            id: true,
            name: true,
            role: true,
            parent_starter_id: true,
            mac_address: true,
            pcb_number: true,
            starter_number: true,
            power: true,
            status: true,
            device_status: true,
            signal_quality: true,
            last_signal_received_at: true,
            device_mobile_number: true,
        },
        with: {
            motors: {
                where: ne(motors.status, "ARCHIVED"),
                columns: { id: true, alias_name: true, hp: true, state: true },
            },
        },
        orderBy: [asc(starterBoxes.parent_starter_id), asc(starterBoxes.id)],
    });
    const byId = new Map();
    rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
    const roots = [];
    for (const r of byId.values()) {
        if (r.parent_starter_id && byId.has(r.parent_starter_id)) {
            byId.get(r.parent_starter_id).children.push(r);
        }
        else {
            roots.push(r);
        }
    }
    return roots;
}
export async function changeRoleWithTransaction(starter, payload, userId) {
    const newRole = payload.role;
    const oldRole = starter.role;
    if (newRole === oldRole && newRole !== "CHILD") {
        return { updated: starter, childrenReassigned: 0 };
    }
    await resolveAndValidateParent(newRole, payload.parent_starter_id ?? null, starter.id);
    let childrenReassigned = 0;
    if (oldRole === "MASTER" && newRole !== "MASTER") {
        const childCount = await countChildrenOfMaster(starter.id);
        if (childCount > 0) {
            const strategy = payload.reassignment ?? "ORPHAN";
            if (strategy === "REPARENT") {
                if (!payload.new_parent_id) {
                    throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).NEW_PARENT_REQUIRED);
                }
                if (payload.new_parent_id === starter.id) {
                    throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).CANNOT_PARENT_SELF);
                }
                const newParent = await getStarterById(payload.new_parent_id);
                if (!newParent) {
                    throw new (await import("../../exceptions/not-found-exception.js")).default((await import("../../constants/app-constants.js")).PARENT_NOT_FOUND);
                }
                if (newParent.role !== "MASTER") {
                    throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).PARENT_MUST_BE_MASTER);
                }
            }
            childrenReassigned = childCount;
        }
    }
    return await db.transaction(async (trx) => {
        if (oldRole === "MASTER" && newRole !== "MASTER" && childrenReassigned > 0) {
            const strategy = payload.reassignment ?? "ORPHAN";
            if (strategy === "REPARENT") {
                await trx.update(starterBoxes)
                    .set({ parent_starter_id: payload.new_parent_id })
                    .where(and(eq(starterBoxes.parent_starter_id, starter.id), ne(starterBoxes.status, "ARCHIVED")));
            }
            else {
                await trx.update(starterBoxes)
                    .set({ parent_starter_id: null })
                    .where(and(eq(starterBoxes.parent_starter_id, starter.id), ne(starterBoxes.status, "ARCHIVED")));
            }
        }
        const updateData = {
            role: newRole,
            parent_starter_id: newRole === "CHILD" ? (payload.parent_starter_id ?? null) : null,
        };
        if (newRole === "CHILD") {
            updateData.device_mobile_number = null;
        }
        const updated = await updateRecordByIdWithTrx(starterBoxes, starter.id, updateData, trx);
        await ActivityService.logActivity({
            performedBy: userId,
            action: "DEVICE_ROLE_CHANGED",
            entityType: "STARTER",
            entityId: starter.id,
            oldData: { role: oldRole, parent_starter_id: starter.parent_starter_id },
            newData: {
                role: newRole,
                parent_starter_id: updateData.parent_starter_id,
                children_reassigned: childrenReassigned,
                reassignment_strategy: childrenReassigned > 0 ? (payload.reassignment ?? "ORPHAN") : null,
            },
        }, trx);
        return { updated, childrenReassigned };
    });
}
export async function reparentWithTransaction(child, newParentId, userId) {
    if (child.role !== "CHILD") {
        throw new (await import("../../exceptions/bad-request-exception.js")).default((await import("../../constants/app-constants.js")).DEVICE_IS_NOT_CHILD);
    }
    await resolveAndValidateParent("CHILD", newParentId, child.id);
    return await db.transaction(async (trx) => {
        const oldParentId = child.parent_starter_id;
        const updated = await updateRecordByIdWithTrx(starterBoxes, child.id, { parent_starter_id: newParentId }, trx);
        await ActivityService.logActivity({
            performedBy: userId,
            action: "DEVICE_REPARENTED",
            entityType: "STARTER",
            entityId: child.id,
            oldData: { parent_starter_id: oldParentId },
            newData: { parent_starter_id: newParentId },
        }, trx);
        return updated;
    });
}
/**
 * MODE A: SWAP_CHILDREN
 * Swap children between two MASTER devices.
 *  - A's children become B's children
 *  - B's children become A's children
 *  - Both devices remain MASTER and stay alive
 *  - Done in one atomic UPDATE using CASE so we never violate FK during the flip
 */
export async function swapMastersChildrenWithTransaction(masterA, masterB, userId) {
    return await db.transaction(async (trx) => {
        // Count children on each side BEFORE the swap (for activity log / response)
        const aChildrenBefore = await getRecordsCount(starterBoxes, [
            eq(starterBoxes.parent_starter_id, masterA.id),
            ne(starterBoxes.status, "ARCHIVED"),
        ]);
        const bChildrenBefore = await getRecordsCount(starterBoxes, [
            eq(starterBoxes.parent_starter_id, masterB.id),
            ne(starterBoxes.status, "ARCHIVED"),
        ]);
        // Atomic swap — one UPDATE with CASE so both sets flip without a transient
        // state where children point at the wrong master.
        await trx.update(starterBoxes)
            .set({
            parent_starter_id: sql `(CASE
          WHEN ${starterBoxes.parent_starter_id} = ${masterA.id} THEN ${masterB.id}::integer
          WHEN ${starterBoxes.parent_starter_id} = ${masterB.id} THEN ${masterA.id}::integer
        END)`,
        })
            .where(and(inArray(starterBoxes.parent_starter_id, [masterA.id, masterB.id]), ne(starterBoxes.status, "ARCHIVED")));
        await ActivityService.logActivity({
            performedBy: userId,
            action: "MASTER_SWAPPED",
            entityType: "STARTER",
            entityId: masterA.id,
            oldData: {
                a_id: masterA.id, a_starter_number: masterA.starter_number, a_children: aChildrenBefore,
                b_id: masterB.id, b_starter_number: masterB.starter_number, b_children: bChildrenBefore,
            },
            newData: {
                a_now_has: bChildrenBefore,
                b_now_has: aChildrenBefore,
            },
        }, trx);
        return {
            mode: "SWAP_CHILDREN",
            master_a_id: masterA.id,
            master_b_id: masterB.id,
            a_received: bChildrenBefore, // A now has what B used to have
            b_received: aChildrenBefore, // B now has what A used to have
        };
    });
}
/**
 * Move children from one MASTER to another MASTER.
 *  - If childIds is null/empty → move ALL of from's children
 *  - If childIds is provided   → move only those (each must belong to fromMaster)
 *  - Both masters stay alive; only children's parent_starter_id changes
 *  - Returns counts before/after so the UI can show "Moved 2 of 4"
 */
export async function moveChildrenWithTransaction(fromMaster, toMaster, childIds, userId) {
    return await db.transaction(async (trx) => {
        // Count before, for the response & audit log
        const fromBefore = await getRecordsCount(starterBoxes, [
            eq(starterBoxes.parent_starter_id, fromMaster.id),
            ne(starterBoxes.status, "ARCHIVED"),
        ]);
        const toBefore = await getRecordsCount(starterBoxes, [
            eq(starterBoxes.parent_starter_id, toMaster.id),
            ne(starterBoxes.status, "ARCHIVED"),
        ]);
        // Build the WHERE for the children we're going to move
        const baseFilters = [
            eq(starterBoxes.parent_starter_id, fromMaster.id),
            ne(starterBoxes.status, "ARCHIVED"),
        ];
        if (childIds && childIds.length > 0) {
            baseFilters.push(inArray(starterBoxes.id, childIds));
        }
        const moved = await trx.update(starterBoxes)
            .set({ parent_starter_id: toMaster.id })
            .where(and(...baseFilters))
            .returning({ id: starterBoxes.id });
        const movedCount = moved.length;
        const fromAfter = fromBefore - movedCount;
        const toAfter = toBefore + movedCount;
        await ActivityService.logActivity({
            performedBy: userId,
            action: "CHILDREN_MOVED",
            entityType: "STARTER",
            entityId: fromMaster.id,
            oldData: {
                from_master_id: fromMaster.id, from_children_before: fromBefore,
                to_master_id: toMaster.id, to_children_before: toBefore,
                selected_child_ids: childIds ?? "ALL",
            },
            newData: {
                moved_count: movedCount,
                from_children_after: fromAfter,
                to_children_after: toAfter,
            },
        }, trx);
        return {
            from_master_id: fromMaster.id,
            to_master_id: toMaster.id,
            moved_count: movedCount,
            moved_ids: moved.map(m => m.id),
            from_children_before: fromBefore,
            from_children_after: fromAfter,
            to_children_before: toBefore,
            to_children_after: toAfter,
        };
    });
}
/**
 * MODE B: REPLACE_DEVICE
 * Replace an old MASTER with a new STANDALONE device (hardware swap).
 *  - All children of old → repointed to new
 *  - New device becomes MASTER, inherits old's user/location/device_status/assigned_at,
 *    and name (only if new was unnamed)
 *  - Old device is ARCHIVED
 *  - Everything in one transaction so partial failures cannot leave bad state
 */
export async function replaceMasterDeviceWithTransaction(oldMaster, newDevice, userId) {
    return await db.transaction(async (trx) => {
        // 1. Re-parent every non-archived child of the old master to the new device
        const movedChildren = await trx.update(starterBoxes)
            .set({ parent_starter_id: newDevice.id })
            .where(and(eq(starterBoxes.parent_starter_id, oldMaster.id), ne(starterBoxes.status, "ARCHIVED")))
            .returning({ id: starterBoxes.id });
        // 2. Promote the new device — copy old's deployment context so it shows up
        //    in the same place in the UI (same user, location, status)
        const newDeviceUpdate = {
            role: "MASTER",
            user_id: oldMaster.user_id,
            location_id: oldMaster.location_id,
            device_status: oldMaster.device_status,
            assigned_at: oldMaster.assigned_at,
        };
        if (!newDevice.name && oldMaster.name)
            newDeviceUpdate.name = oldMaster.name;
        const updatedNew = await updateRecordByIdWithTrx(starterBoxes, newDevice.id, newDeviceUpdate, trx);
        // 3. Archive the old device (soft-delete — keeps all historical data intact)
        const updatedOld = await updateRecordByIdWithTrx(starterBoxes, oldMaster.id, { status: "ARCHIVED" }, trx);
        await ActivityService.logActivity({
            performedBy: userId,
            action: "MASTER_REPLACED",
            entityType: "STARTER",
            entityId: oldMaster.id,
            oldData: {
                old_master_id: oldMaster.id,
                old_master_starter_number: oldMaster.starter_number,
                old_master_name: oldMaster.name,
            },
            newData: {
                new_master_id: newDevice.id,
                new_master_starter_number: newDevice.starter_number,
                children_transferred: movedChildren.length,
            },
        }, trx);
        return {
            mode: "REPLACE_DEVICE",
            old_master_id: oldMaster.id,
            new_master_id: newDevice.id,
            children_transferred: movedChildren.length,
            old: updatedOld,
            new: updatedNew,
        };
    });
}
/**
 * Detail payload for a single device that includes its topology context:
 *   - parent (if CHILD)
 *   - children + each child's motors (if MASTER)
 * Designed to be merged into the existing /:id/motors response by the handler.
 */
export async function getStarterTopologyContext(starterId) {
    const starter = await db.query.starterBoxes.findFirst({
        where: and(eq(starterBoxes.id, starterId), ne(starterBoxes.status, "ARCHIVED")),
        columns: {
            id: true,
            role: true,
            parent_starter_id: true,
        },
    });
    if (!starter)
        return null;
    let parent = null;
    let children = [];
    if (starter.role === "CHILD" && starter.parent_starter_id) {
        parent = await db.query.starterBoxes.findFirst({
            where: and(eq(starterBoxes.id, starter.parent_starter_id), ne(starterBoxes.status, "ARCHIVED")),
            columns: {
                id: true,
                name: true,
                role: true,
                mac_address: true,
                pcb_number: true,
                starter_number: true,
                device_status: true,
                device_allocation: true,
            },
        });
    }
    if (starter.role === "MASTER") {
        children = await getChildrenOfStarter(starter.id);
    }
    return {
        role: starter.role,
        parent_starter_id: starter.parent_starter_id,
        parent,
        children,
        child_count: children.length,
    };
}
