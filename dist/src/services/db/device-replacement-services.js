import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { REPLACE_DEVICE_NOT_ASSIGNED, REPLACE_PCB_DUPLICATE, REPLACE_PCB_MOTOR_TYPE_MISMATCH, REPLACE_PCB_NOT_FOUND, REPLACE_PCB_SAME_AS_CURRENT, REPLACE_SPARE_DEVICE_ASSIGNED, REPLACE_SPARE_DEVICE_NOT_DEPLOYED, REPLACE_SPARE_DEVICE_NOT_FOUND, REPLACE_SPARE_NUMBERS_MISMATCH, STARTER_BOX_NOT_FOUND } from "../../constants/app-constants.js";
import db from "../../database/configuration.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterDispatch } from "../../database/schemas/starter-dispatch.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import BaseException from "../../exceptions/base-exception.js";
import ConflictException from "../../exceptions/conflict-exception.js";
import NotFoundException from "../../exceptions/not-found-exception.js";
import UnprocessableEntityException from "../../exceptions/unprocessable-entity-exception.js";
import { clearSettingsSyncAttempts } from "../../helpers/ack-tracker-hepler.js";
import { todayAsYYMMDD } from "../../helpers/motor-schedule-payload-helper.js";
import { logger } from "../../utils/logger.js";
import { ActivityService } from "./activity-service.js";
import { saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { SLOT_FREE_STATUSES } from "./motor-schedules-services.js";
import { getStarterDefaultSettings } from "./settings-services.js";
/**
 * A replacement attempt that was refused on business rules (unassigned device, spare not
 * found / not deployed, unchanged number). Carries what the device log needs (`result`,
 * `failureReason`, the device row as it was when the check ran) and the HTTP exception the
 * caller should get.
 */
class ReplacementAttemptError extends Error {
    result;
    failureReason;
    httpError;
    starter;
    constructor(result, failureReason, httpError, starter) {
        super(httpError.message);
        this.result = result;
        this.failureReason = failureReason;
        this.httpError = httpError;
        this.starter = starter;
    }
}
/**
 * Locks the device row for the rest of the transaction and re-checks eligibility, so an
 * unassignment that lands between the admin opening the dialog and saving is caught here.
 * The row lock also makes two admins replacing the same device queue up instead of racing.
 *
 * Only a device that is assigned to a user can be replaced. An unassigned device has no
 * customer, settings or history worth carrying over — the admin deletes it and adds the
 * new one instead.
 */
async function lockReplaceableStarter(trx, starterId) {
    const [starter] = await trx.select().from(starterBoxes)
        .where(and(eq(starterBoxes.id, starterId), ne(starterBoxes.status, "ARCHIVED")))
        .for("update");
    if (!starter)
        throw new NotFoundException(STARTER_BOX_NOT_FOUND);
    if (starter.device_status !== "ASSIGNED" || !starter.user_id) {
        throw new ReplacementAttemptError("BLOCKED", "device is not assigned to a user", new ConflictException(REPLACE_DEVICE_NOT_ASSIGNED), starter);
    }
    return starter;
}
/**
 * Locks the spare device the replacement hardware comes from, found by its PCB Number.
 * The lock stops two admins from using the same spare for two different replacements.
 */
async function lockSpareDeviceByPcb(trx, oldId, newPcbNumber) {
    const [spare] = await trx.select().from(starterBoxes)
        .where(and(ne(starterBoxes.status, "ARCHIVED"), ne(starterBoxes.id, oldId), sql `lower(${starterBoxes.pcb_number}) = ${newPcbNumber.toLowerCase()}`))
        .for("update");
    return spare;
}
/**
 * The spare must be a tested, DEPLOYED device nobody owns yet — the same state
 * POST /starters/assign requires — and of the same motor type as the device it replaces,
 * since a PCB/box is wired for a fixed number of motors.
 */
async function ensureSpareIsDeployable(trx, old, spare) {
    if (spare.user_id || spare.device_status === "ASSIGNED") {
        throw new ReplacementAttemptError("FAILED", `Device ${spare.starter_number} is assigned to a user and cannot be used as a replacement`, new ConflictException(REPLACE_SPARE_DEVICE_ASSIGNED, { field: "pcb_number" }), old);
    }
    if (spare.device_status !== "DEPLOYED") {
        throw new ReplacementAttemptError("FAILED", `Device ${spare.starter_number} is in ${spare.device_status} state, not DEPLOYED`, new ConflictException(REPLACE_SPARE_DEVICE_NOT_DEPLOYED, { field: "pcb_number" }), old);
    }
    const [spareArity, oldArity] = await Promise.all([
        deviceMotorArity(trx, spare),
        deviceMotorArity(trx, old),
    ]);
    if (spareArity !== oldArity) {
        throw new ReplacementAttemptError("FAILED", `Device ${spare.starter_number} is a ${motorTypeLabel(spareArity)} device and cannot replace a ${motorTypeLabel(oldArity)} device`, new ConflictException(REPLACE_PCB_MOTOR_TYPE_MISMATCH, { field: "pcb_number" }), old);
    }
}
const motorTypeLabel = (t) => (t === "MULTIPLE_MOTORS" ? "dual-motor" : "single-motor");
/**
 * A device's REAL motor arity, from its live motor rows — not the motor_support_type
 * column, which can drift out of sync (e.g. a motor removed without the column being
 * corrected back to SINGLE_MOTOR). Same rule starterFilters' ?motor_type= search param
 * already applies, for the same reason.
 */
async function deviceMotorArity(trx, device) {
    const [row] = await trx.select({ count: sql `count(*)` }).from(motors)
        .where(and(eq(motors.starter_id, device.id), ne(motors.status, "ARCHIVED")));
    return Number(row?.count ?? 0) >= 2 ? "MULTIPLE_MOTORS" : "SINGLE_MOTOR";
}
/**
 * Retires a device and its motors. device_status: "REPLACED" (on top of status: "ARCHIVED")
 * is what lets a "Replaced" filter find devices retired by a replacement — a plain delete
 * (deleteStarterBoxHandler) only ever sets status, so it never shows up there. Also frees
 * the device's live-rows-only unique values (name, starter/PCB number, MAC).
 */
async function retireDeviceAndMotors(trx, device) {
    await trx.update(motors).set({ status: "ARCHIVED" })
        .where(and(eq(motors.starter_id, device.id), ne(motors.status, "ARCHIVED")));
    await updateRecordById(starterBoxes, device.id, { status: "ARCHIVED", device_status: "REPLACED" }, trx);
}
/**
 * Settings that belong to the physical board, not to the customer's motor: ATMEL / ADC /
 * PT100 calibration (tuned to that board's analog front end) and the MQTT identity it
 * connects with. On a replacement these always come from the board now fitted; every
 * other setting (FLC, fault/alert thresholds and enables, recovery, trip and star-delta
 * timings, IVRS numbers, reporting frequencies, feature enables) is the customer's
 * configuration and follows the customer's device.
 */
const BOARD_SETTINGS_FIELDS = [
    "ug_r", "ug_y", "ug_b", "ip_r", "ip_y", "ip_b",
    "vg_r", "vg_y", "vg_b", "vo_r", "vo_y", "vo_b", "ig_r", "ig_y", "ig_b", "io_r", "io_y", "io_b",
    "r1", "r2", "off", "limit",
    "ca_fn", "bkr_adrs", "sn", "usrn", "pswd", "prd_url", "port", "crt_en",
];
/** Per-motor current calibration inside a dual box's multi_motor_config block — board-specific too. */
const BOARD_MOTOR_BLOCK_FIELDS = ["ig_r", "ig_y", "ig_b", "io_r", "io_y", "io_b"];
/** The configuration a device is meant to be running — the same row the settings screen and publish path read. */
async function currentSettings(trx, starterId) {
    return await trx.query.starterSettings.findFirst({
        where: and(eq(starterSettings.starter_id, starterId), eq(starterSettings.acknowledgement, "TRUE"), eq(starterSettings.is_new_configuration_saved, 1)),
        orderBy: desc(starterSettings.created_at),
    });
}
/**
 * Saves the customer's configuration as the target device's new current settings row,
 * with the board-specific fields taken from the board now fitted, and flags the device
 * so the next heartbeat publishes it (the same synced_settings_status path a newly added
 * device uses). Returns false when the customer device never had a saved configuration —
 * there is nothing to hand over and the target keeps what it has.
 *
 * `motorIdByIndex` maps motor_index to the TARGET device's motor ids, so dual-box
 * per-motor blocks land on the right motor after a box swap.
 */
async function handOverSettings(trx, params) {
    const customer = await currentSettings(trx, params.customerStarterId);
    if (!customer)
        return false;
    // A board with no saved configuration has only ever had the default calibration.
    const board = (await currentSettings(trx, params.boardStarterId))
        ?? (await getStarterDefaultSettings())[0];
    const { id: _id, starter_id: _sid, created_at: _ca, updated_at: _ua, time_stamp: _ts, created_by: _cb, ...customerFields } = customer;
    const boardFields = {};
    for (const field of BOARD_SETTINGS_FIELDS) {
        const value = board?.[field];
        if (value !== undefined)
            boardFields[field] = value;
    }
    let multiMotorConfig = customer.multi_motor_config ?? null;
    if (multiMotorConfig) {
        const boardBlocks = new Map((board?.multi_motor_config?.motors ?? []).map((b) => [b.motor_index ?? 1, b]));
        const motorBlocks = [];
        for (const block of multiMotorConfig.motors) {
            const motorIndex = block.motor_index ?? params.oldMotorIndexById.get(block.motor_id) ?? 1;
            const targetMotorId = params.motorIdByIndex.get(motorIndex);
            if (targetMotorId === undefined)
                continue;
            const boardBlock = boardBlocks.get(motorIndex);
            const boardCalibration = {};
            for (const field of BOARD_MOTOR_BLOCK_FIELDS) {
                if (boardBlock?.[field] !== undefined)
                    boardCalibration[field] = boardBlock[field];
            }
            motorBlocks.push({
                ...block,
                ...boardCalibration,
                motor_id: targetMotorId,
                motor_index: motorIndex,
                // The board hasn't received this block yet — it re-syncs before it's "current".
                acknowledgement: "FALSE",
            });
        }
        multiMotorConfig = { ...multiMotorConfig, motors: motorBlocks };
    }
    await saveSingleRecord(starterSettings, {
        ...customerFields,
        ...boardFields,
        multi_motor_config: multiMotorConfig,
        starter_id: params.targetStarterId,
        created_by: params.performerId,
        acknowledgement: "TRUE",
        is_new_configuration_saved: 1,
    }, trx);
    await updateRecordById(starterBoxes, params.targetStarterId, { synced_settings_status: "false" }, trx);
    return true;
}
/**
 * Schedule statuses that still have to run on the device. Finished ones
 * (SLOT_FREE_STATUSES) are history and STOPPED was stopped by the user, so neither is
 * re-sent to new hardware.
 */
const UPCOMING_SCHEDULE_STATUSES = ["PENDING", "SCHEDULED", "RUNNING", "WAITING_NEXT_CYCLE", "RESTARTED", "UNDELIVERED"];
/** Clears a schedule's device-side state so the heartbeat push re-sends it to the board now fitted, which has an empty slot table. */
const resendScheduleFields = () => ({
    schedule_status: "PENDING",
    acknowledgement: 0,
    acknowledged_at: null,
    device_schedule_id: null,
    publish_attempts: 0,
    updated_at: new Date(),
});
const upcomingSchedulesOf = (motorId) => and(eq(motorSchedules.motor_id, motorId), ne(motorSchedules.status, "ARCHIVED"), inArray(motorSchedules.schedule_status, [...UPCOMING_SCHEDULE_STATUSES]), gte(motorSchedules.schedule_end_date, todayAsYYMMDD()));
/**
 * Box replacement: moves each old motor's upcoming schedules onto the spare motor in the
 * same slot and queues them for delivery. Finished schedules stay on the retired device
 * as its history. Whatever the spare itself still had pending is deleted first — it
 * belonged to its bench testing, not to this customer, and would otherwise collide with
 * the moved schedules' ids.
 */
async function handOverSchedules(trx, spareId, oldMotorIds, spareMotorIdByIndex, performerId) {
    await trx.update(motorSchedules).set({ schedule_status: "DELETED", deleted_by: performerId, deleted_at: new Date(), updated_at: new Date() })
        .where(and(eq(motorSchedules.starter_id, spareId), ne(motorSchedules.status, "ARCHIVED"), notInArray(motorSchedules.schedule_status, [...SLOT_FREE_STATUSES])));
    for (const [oldMotorId, motorIndex] of oldMotorIds) {
        const spareMotorId = spareMotorIdByIndex.get(motorIndex);
        if (spareMotorId === undefined)
            continue;
        await trx.update(motorSchedules)
            .set({ ...resendScheduleFields(), motor_id: spareMotorId, starter_id: spareId })
            .where(upcomingSchedulesOf(oldMotorId));
    }
}
/** PCB replacement: same motors, but the new board has none of their schedules — queue them all again. */
async function resendSchedules(trx, motorIds) {
    for (const motorId of motorIds) {
        await trx.update(motorSchedules).set(resendScheduleFields()).where(upcomingSchedulesOf(motorId));
    }
}
/**
 * Runs `attempt` in one transaction and guarantees exactly one log entry per attempt:
 *  - success: the entry is written INSIDE the transaction (`attempt` calls it), so the change
 *    and its log commit or roll back together;
 *  - blocked / failed: the transaction has rolled back by the time we get here, so the entry
 *    is written on a fresh connection, OUTSIDE it. Writing it inside would have been rolled
 *    back with the change it describes.
 * A failure to write the blocked/failed entry is logged and swallowed so it never hides the
 * real error from the caller. Errors raised before the device was found (404) have no
 * attempt to record and pass through untouched.
 */
async function runLoggedReplacement(type, input, attempt) {
    let lockedStarter;
    try {
        return await db.transaction(async (trx) => await attempt(trx, (starter) => { lockedStarter = starter; }));
    }
    catch (error) {
        let result = "FAILED";
        let failureReason = "unexpected error while replacing the device";
        let httpError = error;
        let starter = lockedStarter;
        if (error instanceof ReplacementAttemptError) {
            ({ result, failureReason, httpError, starter } = error);
        }
        else if (error instanceof BaseException) {
            throw error;
        }
        else {
            // A concurrent insert can still beat the spare's retirement and hit the unique index.
            const pgError = error?.cause ?? error;
            if (pgError?.code === "23505" && pgError.constraint === "validate_pcb_number") {
                failureReason = `PCB Number ${input.newPcbNumber} is already used by another device`;
                httpError = new ConflictException(REPLACE_PCB_DUPLICATE, { field: "pcb_number" });
            }
            else {
                logger.error(`Error at ${type} replacement on starter ${input.starterId}`, error);
            }
        }
        if (starter) {
            try {
                await ActivityService.writeDeviceReplacementLog({
                    performedBy: input.performer.id,
                    performedByName: input.performer.full_name,
                    deviceId: starter.id,
                    type,
                    result,
                    old: { starter_id: starter.id, starter_number: starter.starter_number, pcb_number: starter.pcb_number },
                    next: type === "BOX"
                        ? { starter_number: input.newStarterNumber, pcb_number: input.newPcbNumber }
                        : { pcb_number: input.newPcbNumber },
                    reason: input.reason,
                    reasonNote: input.reasonNote,
                    failureReason,
                });
            }
            catch (logError) {
                logger.error(`Could not write ${result} ${type} replacement log for starter ${starter.id}`, logError);
            }
        }
        throw httpError;
    }
}
/**
 * PCB replacement: the new PCB is taken out of a spare DEPLOYED device and fitted into the
 * assigned device's box. The assigned device record keeps its Starter Number, user, motors
 * and history; the board identity (PCB Number, MAC, firmware payload version, hardware
 * version, allocation) and board calibration move over from the spare. The spare record —
 * now a box without a PCB — is retired.
 *
 * The new board starts empty, so the device's settings and upcoming schedules are queued
 * to be sent to it again on its next heartbeat.
 */
export async function replacePcbWithTransaction(input) {
    const device = await runLoggedReplacement("PCB", input, async (trx, remember) => {
        const starter = await lockReplaceableStarter(trx, input.starterId);
        remember(starter);
        if (input.newPcbNumber.toLowerCase() === (starter.pcb_number ?? "").toLowerCase()) {
            throw new ReplacementAttemptError("FAILED", "new PCB Number is the same as the current one", new UnprocessableEntityException(REPLACE_PCB_SAME_AS_CURRENT, { new_pcb_number: REPLACE_PCB_SAME_AS_CURRENT }), starter);
        }
        const spare = await lockSpareDeviceByPcb(trx, starter.id, input.newPcbNumber);
        if (!spare) {
            throw new ReplacementAttemptError("FAILED", `no device found with PCB Number ${input.newPcbNumber}`, new NotFoundException(REPLACE_PCB_NOT_FOUND), starter);
        }
        await ensureSpareIsDeployable(trx, starter, spare);
        // Retire the spare first: its PCB Number and MAC must be free (live-rows-only unique
        // indexes) before they're written onto the assigned device.
        await retireDeviceAndMotors(trx, spare);
        const updated = await updateRecordById(starterBoxes, starter.id, {
            pcb_number: spare.pcb_number,
            mac_address: spare.mac_address,
            device_allocation: spare.device_allocation,
            payload_version: spare.payload_version,
            hardware_version: spare.hardware_version,
        }, trx);
        // Keep the dispatch record findable by the PCB now fitted, as PATCH /:id/details does.
        await trx.update(starterDispatch).set({ pcb_number: spare.pcb_number, updated_at: new Date() })
            .where(and(eq(starterDispatch.starter_id, starter.id), ne(starterDispatch.status, "ARCHIVED")));
        const liveMotors = await trx.select({ id: motors.id, motor_index: motors.motor_index }).from(motors)
            .where(and(eq(motors.starter_id, starter.id), ne(motors.status, "ARCHIVED")));
        const motorIdByIndex = new Map(liveMotors.map((m) => [m.motor_index ?? 1, m.id]));
        await handOverSettings(trx, {
            customerStarterId: starter.id,
            boardStarterId: spare.id,
            targetStarterId: starter.id,
            oldMotorIndexById: new Map(liveMotors.map((m) => [m.id, m.motor_index ?? 1])),
            motorIdByIndex,
            performerId: input.performer.id,
        });
        await resendSchedules(trx, liveMotors.map((m) => m.id));
        await ActivityService.writeDeviceReplacementLog({
            performedBy: input.performer.id,
            performedByName: input.performer.full_name,
            deviceId: starter.id,
            type: "PCB",
            result: "SUCCESS",
            old: { starter_id: starter.id, starter_number: starter.starter_number, pcb_number: starter.pcb_number },
            next: { starter_id: spare.id, starter_number: spare.starter_number, pcb_number: spare.pcb_number },
            reason: input.reason,
            reasonNote: input.reasonNote,
        }, trx);
        return updated;
    });
    armResyncAfterReplacement(device.id);
    return device;
}
/**
 * Box replacement: a spare DEPLOYED device (named by its Starter Number + PCB Number, picked
 * from the Replace Device dialog's dropdown) takes the assigned device's place. The old
 * device is retired (ARCHIVED + REPLACED, history kept on its record) and the spare takes
 * over the assignment — user, location, gateway, name, sub-user access and each motor's
 * customer-facing details by motor slot. The old device's settings (with the spare's own
 * board calibration) and its upcoming schedules move to the spare and are queued for
 * delivery on its next heartbeat. Telemetry and finished schedules stay on the retired
 * device as its history.
 */
export async function replaceBoxWithTransaction(input) {
    const result = await runLoggedReplacement("BOX", input, async (trx, remember) => {
        const old = await lockReplaceableStarter(trx, input.starterId);
        remember(old);
        const spare = await lockSpareDeviceByPcb(trx, old.id, input.newPcbNumber);
        if (!spare) {
            throw new ReplacementAttemptError("FAILED", `no device found with PCB Number ${input.newPcbNumber}`, new NotFoundException(REPLACE_SPARE_DEVICE_NOT_FOUND), old);
        }
        if (spare.starter_number.toLowerCase() !== input.newStarterNumber.toLowerCase()) {
            throw new ReplacementAttemptError("FAILED", `PCB Number ${input.newPcbNumber} belongs to device ${spare.starter_number}, not ${input.newStarterNumber}`, new UnprocessableEntityException(REPLACE_SPARE_NUMBERS_MISMATCH, { new_starter_number: REPLACE_SPARE_NUMBERS_MISMATCH }), old);
        }
        await ensureSpareIsDeployable(trx, old, spare);
        const oldMotors = await trx.select().from(motors)
            .where(and(eq(motors.starter_id, old.id), ne(motors.status, "ARCHIVED")));
        const spareMotors = await trx.select({ id: motors.id, motor_index: motors.motor_index }).from(motors)
            .where(and(eq(motors.starter_id, spare.id), ne(motors.status, "ARCHIVED")));
        // Retire the old box first: its name must be free (live-rows-only unique index) before
        // it's written onto the spare.
        await retireDeviceAndMotors(trx, old);
        const assignedAt = new Date();
        const device = await updateRecordById(starterBoxes, spare.id, {
            name: old.name,
            alias_name: old.alias_name,
            user_id: old.user_id,
            location_id: old.location_id,
            gateway_id: old.gateway_id,
            device_installed_location: old.device_installed_location,
            installation_photo_key: old.installation_photo_key,
            device_status: "ASSIGNED",
            assigned_at: assignedAt,
        }, trx);
        // Same motor type is guaranteed above, so every old motor slot has a spare motor at the
        // same motor_index.
        const spareMotorIdByIndex = new Map(spareMotors.map((m) => [m.motor_index ?? 1, m.id]));
        for (const oldMotor of oldMotors) {
            const spareMotorId = spareMotorIdByIndex.get(oldMotor.motor_index ?? 1);
            if (!spareMotorId)
                continue;
            await trx.update(motors).set({
                alias_name: oldMotor.alias_name,
                hp: oldMotor.hp,
                motor_reference: oldMotor.motor_reference,
                location_id: oldMotor.location_id,
                user_id: oldMotor.user_id,
                created_by: oldMotor.created_by,
                assigned_at: assignedAt,
            }).where(eq(motors.id, spareMotorId));
            // Sub-users the owner shared this motor with keep their access on the new one.
            await trx.update(subUserPermissions).set({ motor_id: spareMotorId, updated_at: new Date() })
                .where(eq(subUserPermissions.motor_id, oldMotor.id));
        }
        await trx.update(subUserPermissions).set({ starter_id: spare.id, updated_at: new Date() })
            .where(eq(subUserPermissions.starter_id, old.id));
        const oldMotorIndexById = new Map(oldMotors.map((m) => [m.id, m.motor_index ?? 1]));
        await handOverSettings(trx, {
            customerStarterId: old.id,
            boardStarterId: spare.id,
            targetStarterId: spare.id,
            oldMotorIndexById,
            motorIdByIndex: spareMotorIdByIndex,
            performerId: input.performer.id,
        });
        await handOverSchedules(trx, spare.id, oldMotorIndexById, spareMotorIdByIndex, input.performer.id);
        await ActivityService.writeDeviceReplacementLog({
            performedBy: input.performer.id,
            performedByName: input.performer.full_name,
            deviceId: spare.id,
            type: "BOX",
            result: "SUCCESS",
            old: { starter_id: old.id, starter_number: old.starter_number, pcb_number: old.pcb_number },
            next: { starter_id: spare.id, starter_number: spare.starter_number, pcb_number: spare.pcb_number },
            reason: input.reason,
            reasonNote: input.reasonNote,
        }, trx);
        return { device, replacedDeviceId: old.id };
    });
    armResyncAfterReplacement(result.device.id);
    return result;
}
/**
 * Runs after commit: drops the in-memory bounded-retry counter so the next heartbeat
 * actually publishes the handed-over settings (a spare that exhausted its retries on the
 * bench would otherwise stay silent). Schedules need nothing here — the heartbeat push
 * picks up every unacknowledged PENDING schedule on its own.
 */
function armResyncAfterReplacement(starterId) {
    clearSettingsSyncAttempts(starterId);
    logger.info(`[device-replacement] starter=${starterId} settings and schedules queued for delivery`);
}
