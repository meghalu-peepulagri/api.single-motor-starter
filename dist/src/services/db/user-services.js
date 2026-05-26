import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { deviceTokens } from "../../database/schemas/device-tokens.js";
import { fields } from "../../database/schemas/fields.js";
import { gateways } from "../../database/schemas/gateways.js";
import { locations } from "../../database/schemas/locations.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { users } from "../../database/schemas/users.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import { getRecordsCount } from "./base-db-services.js";
import { ActivityService } from "./activity-service.js";
export async function paginatedUsersList(whereQueryData, orderByQueryData, pageParams) {
    const whereConditions = prepareWhereQueryConditionsWithOr(users, whereQueryData);
    const whereQuery = whereConditions && whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const orderQuery = prepareOrderByQueryConditions(users, orderByQueryData);
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
export async function checkPhoneUniqueness(phones, excludeUserId) {
    if (phones.length === 0)
        return true;
    const phoneConditions = or(inArray(users.phone, phones), inArray(users.alternate_phone_1, phones), inArray(users.alternate_phone_2, phones), inArray(users.alternate_phone_3, phones), inArray(users.alternate_phone_4, phones), inArray(users.alternate_phone_5, phones));
    let finalCondition = and(ne(users.status, "ARCHIVED"), phoneConditions);
    if (excludeUserId) {
        finalCondition = and(finalCondition, ne(users.id, excludeUserId));
    }
    const existingUsers = await db.select({ id: users.id }).from(users).where(finalCondition).limit(1);
    return existingUsers.length === 0;
}
export async function checkPhoneUniquenessVerify(phones, excludeUserId) {
    if (phones.length === 0)
        return null;
    const phoneConditions = eq(users.phone, phones);
    let finalCondition = and(ne(users.status, "ARCHIVED"), phoneConditions);
    if (excludeUserId) {
        finalCondition = and(finalCondition, ne(users.id, excludeUserId));
    }
    const result = await db.select({ id: users.id }).from(users).where(finalCondition).limit(1);
    return result[0] ?? null;
}
export async function getUserDetailsWithLocations(userId, pageParams) {
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
    if (!user)
        return null;
    // 2. Get total locations count for this user
    const [locationsCount] = await db
        .select({ total: sql `CAST(count(*) AS INTEGER)` })
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
            total_motors: sql `
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.status <> 'ARCHIVED'
        )
      `.as("total_motors"),
            on_state_count: sql `
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.state = 1
          AND motors.status <> 'ARCHIVED'
        )
      `.as("on_state_count"),
            auto_mode_count: sql `
        (
          SELECT CAST(count(*) AS INTEGER)
          FROM motors
          WHERE motors.location_id = ${locations.id}
          AND motors.mode = 'AUTO'
          AND motors.status <> 'ARCHIVED'
        )
      `.as("auto_mode_count"),
            manual_mode_count: sql `
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
    });
    return {
        user,
        locations: {
            pagination_info: paginationInfo,
            locations_count: totalRecords,
            records: paginatedLocations,
        },
    };
}
export async function deleteUserWithCascade(userId, performedBy, isSelfDelete, userSnapshot) {
    await db.transaction(async (trx) => {
        const now = new Date();
        // Revoke all active sessions
        await trx.update(deviceTokens)
            .set({ status: "INACTIVE" })
            .where(eq(deviceTokens.user_id, userId));
        // Find all starters owned by this user
        const userStarters = await trx
            .select({ id: starterBoxes.id })
            .from(starterBoxes)
            .where(and(eq(starterBoxes.user_id, userId), ne(starterBoxes.status, "ARCHIVED")));
        const starterIds = userStarters.map(s => s.id);
        if (starterIds.length > 0) {
            // Find all motors under those starters
            const starterMotors = await trx
                .select({ id: motors.id })
                .from(motors)
                .where(and(inArray(motors.starter_id, starterIds), ne(motors.status, "ARCHIVED")));
            const motorIds = starterMotors.map(m => m.id);
            if (motorIds.length > 0) {
                // Cancel active schedules — pump may be running, must stop cleanly
                await trx.update(motorSchedules)
                    .set({
                    status: "ARCHIVED",
                    schedule_status: "DELETED",
                    enabled: false,
                    deleted_at: now,
                    deleted_by: performedBy,
                    updated_at: now,
                })
                    .where(and(inArray(motorSchedules.motor_id, motorIds), inArray(motorSchedules.schedule_status, ["RUNNING", "PENDING", "SCHEDULED", "WAITING_NEXT_CYCLE"])));
                // Archive motors — they are logical associations, not hardware.
                // Device returns to DEPLOYED pool; new motors are created on reassignment.
                await trx.update(motors)
                    .set({ status: "ARCHIVED", state: 0, location_id: null, updated_at: now })
                    .where(and(inArray(motors.starter_id, starterIds), ne(motors.status, "ARCHIVED")));
            }
            // Release devices back to the DEPLOYED inventory pool
            await trx.update(starterBoxes)
                .set({
                status: "INACTIVE",
                device_status: "DEPLOYED",
                user_id: null,
                location_id: null,
                gateway_id: null,
                assigned_at: null,
                updated_at: now,
            })
                .where(and(eq(starterBoxes.user_id, userId), ne(starterBoxes.status, "ARCHIVED")));
        }
        // 7. Release gateways back to unassigned state
        await trx.update(gateways)
            .set({ status: "INACTIVE", user_id: null, location_id: null, updated_at: now })
            .where(and(eq(gateways.user_id, userId), ne(gateways.status, "ARCHIVED")));
        // 8. Archive user-owned fields
        await trx.update(fields)
            .set({ status: "ARCHIVED", updated_at: now })
            .where(and(eq(fields.created_by, userId), ne(fields.status, "ARCHIVED")));
        // 9. Archive user-owned locations
        await trx.update(locations)
            .set({ status: "ARCHIVED", updated_at: now })
            .where(and(eq(locations.user_id, userId), ne(locations.status, "ARCHIVED")));
        // Archive the user
        await trx.update(users)
            .set({ status: "ARCHIVED", updated_at: now })
            .where(eq(users.id, userId));
        // 11. Audit trail
        await ActivityService.writeUserDeletedLog(userId, performedBy, isSelfDelete, userSnapshot, trx);
    });
}
