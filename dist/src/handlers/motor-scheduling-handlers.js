import { inArray } from "drizzle-orm";
import { ACKNOWLEDGEMENT_UPDATED, ADD_REPEAT_DAYS_VALIDATION_CRITERIA, ALL_SCHEDULES_STOPPED, CANNOT_EDIT_RUNNING_SCHEDULE, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA, MOTOR_NOT_FOUND, NO_ACTIVE_SCHEDULE, PENDING_SCHEDULES_FETCHED, REPEAT_DAYS_ADDED, INVALID_SCHEDULE_CMD, SCHEDULE_CMD_REQUIRED, SCHEDULE_DELETED, SCHEDULE_DETAILS_FETCHED, SCHEDULE_NOT_FOUND, SCHEDULE_RESTARTED, SCHEDULE_STOPPED, SCHEDULE_UPDATED, SCHEDULED_CREATED, SCHEDULED_LIST_FETCHED, SCHEDULE_STATUS_SYNC_COMPLETED, UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { checkMotorScheduleConflict, validateScheduleTypeRules, } from "../helpers/motor-helper.js";
import { evaluateScheduleStatus } from "../helpers/schedule-status-evaluator.js";
import { buildMotorScheduleFilters } from "../helpers/motor-schedule-filter-helper.js";
import { buildDeviceSyncPayloads, buildScheduleData, formatMotorScheduleListResponse, formatMotorScheduleResponse, normalizeMotorSchedulePayload, normalizeRepeatDaysPayload, todayAsYYMMDD, } from "../helpers/motor-schedule-payload-helper.js";
import { getRecordById, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { batchUpdateScheduleStatuses, cancelSchedulesByIds, findActiveScheduleById, findAllActiveSchedulesForMotor, findConflictingSchedules, findEvaluatableSchedules, findPendingSchedulesForSync, findSchedulesByFilters, getNextScheduleIdForMotor, restartScheduleById, stopScheduleById } from "../services/db/motor-schedules-services.js";
import { publishMultipleTimesInBackground } from "../helpers/settings-helpers.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class MotorScheduleHandler {
    // =================== CREATE SCHEDULE ===================
    createMotorScheduleHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqData = await c.req.json();
            const normalizedReqData = normalizeMotorSchedulePayload(reqData);
            const data = await validatedRequest("create-motor-schedule", normalizedReqData, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA);
            // Verify motor exists and is not archived
            const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [data.motor_id, "ARCHIVED"], ["id"]);
            if (!existedMotor)
                throw new BadRequestException(MOTOR_NOT_FOUND);
            validateScheduleTypeRules(data);
            // Use user-provided schedule_start_date for one-time schedules, fallback to today
            const scheduleStartDate = data.schedule_start_date || todayAsYYMMDD();
            const scheduleEndDate = data.schedule_end_date || scheduleStartDate;
            // Conflict detection: fetch potential conflicts by date range/days, then check time overlap
            const conflictStartDate = data.repeat === 1 ? null : scheduleStartDate;
            const conflictEndDate = data.repeat === 1 ? null : scheduleEndDate;
            const existingSchedules = await findConflictingSchedules(existedMotor.id, conflictStartDate, conflictEndDate, data.days_of_week || []);
            checkMotorScheduleConflict({ ...data, schedule_start_date: scheduleStartDate, schedule_end_date: scheduleEndDate }, existingSchedules);
            // Auto-increment schedule_id per motor
            const nextScheduleId = await getNextScheduleIdForMotor(data.motor_id);
            // Prepare and save
            const preparedData = {
                ...buildScheduleData(data, scheduleStartDate),
                schedule_id: nextScheduleId,
                created_by: userPayload.id,
                enabled: data.enabled ?? true,
            };
            const savedSchedule = await saveSingleRecord(motorSchedules, preparedData);
            return sendResponse(c, 201, SCHEDULED_CREATED, savedSchedule);
        }
        catch (error) {
            console.error("Error at create Motor Schedule:", error.message);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at create Motor Schedule:", error.message);
            throw error;
        }
    };
    // =================== LIST SCHEDULES (with filters) ===================
    motorScheduleListHandler = async (c) => {
        try {
            const query = c.req.query();
            const page = +(query.page) || 1;
            const limit = +(query.limit) || 10;
            const filters = buildMotorScheduleFilters(query);
            const queryDate = filters.schedule_start_date;
            const result = await findSchedulesByFilters(filters, page, limit);
            return sendResponse(c, 200, SCHEDULED_LIST_FETCHED, formatMotorScheduleListResponse(result, queryDate));
        }
        catch (error) {
            console.error("Error at motor Schedule List:", error.message);
            throw error;
        }
    };
    // =================== GET SINGLE SCHEDULE ===================
    getMotorScheduleByIdHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const schedule = await getRecordById(motorSchedules, scheduleId);
            if (!schedule)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            return sendResponse(c, 200, SCHEDULE_DETAILS_FETCHED, formatMotorScheduleResponse(schedule));
        }
        catch (error) {
            console.error("Error at get motor Schedule by id:", error.message);
            throw error;
        }
    };
    // =================== EDIT SCHEDULE ===================
    editMotorScheduleHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const reqData = await c.req.json();
            const normalizedReqData = normalizeMotorSchedulePayload(reqData);
            const data = await validatedRequest("update-motor-schedule", normalizedReqData, UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA);
            const existedSchedule = await getRecordById(motorSchedules, scheduleId, ["id", "motor_id", "schedule_status"]);
            if (!existedSchedule)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            // Cannot edit a RUNNING schedule
            if (existedSchedule.schedule_status === "RUNNING") {
                throw new BadRequestException(CANNOT_EDIT_RUNNING_SCHEDULE);
            }
            validateScheduleTypeRules(data);
            // Conflict detection: fetch potential conflicts by date range/days, then check time overlap
            const scheduleStartDate = data.schedule_start_date || todayAsYYMMDD();
            const scheduleEndDate = data.schedule_end_date || scheduleStartDate;
            const conflictStartDate = data.repeat === 1 ? null : scheduleStartDate;
            const conflictEndDate = data.repeat === 1 ? null : scheduleEndDate;
            const existingSchedules = await findConflictingSchedules(existedSchedule.motor_id, conflictStartDate, conflictEndDate, data.days_of_week || [], scheduleId);
            checkMotorScheduleConflict({ ...data, schedule_start_date: scheduleStartDate, schedule_end_date: scheduleEndDate }, existingSchedules);
            // Update
            const updateData = buildScheduleData(data, scheduleStartDate);
            await updateRecordById(motorSchedules, scheduleId, updateData);
            return sendResponse(c, 200, SCHEDULE_UPDATED);
        }
        catch (error) {
            console.error("Error at edit motor Schedule:", error.message);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    // =================== DELETE SCHEDULE ===================
    deleteMotorScheduleHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const existed = await getRecordById(motorSchedules, scheduleId, ["id", "schedule_status"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            // If schedule is RUNNING, stop it first (no compensation)
            if (existed.schedule_status === "RUNNING") {
                await stopScheduleById(scheduleId);
            }
            // Soft delete: mark as DELETED with deleted_by user and deleted_at timestamp
            await updateRecordById(motorSchedules, existed.id, {
                schedule_status: "DELETED",
                deleted_by: userPayload.id,
                deleted_at: new Date(),
                status: "ARCHIVED",
                enabled: false,
            });
            return sendResponse(c, 200, SCHEDULE_DELETED);
        }
        catch (error) {
            console.error("Error at delete motor Schedule:", error.message);
            throw error;
        }
    };
    // =================== UPDATE SCHEDULE STATUS (STOP / RESTART) ===================
    // cmd: 1 = Stop, 2 = Restart
    updateScheduleStatusHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const { cmd } = await c.req.json();
            if (cmd === undefined || cmd === null)
                throw new BadRequestException(SCHEDULE_CMD_REQUIRED);
            if (cmd !== 1 && cmd !== 2)
                throw new BadRequestException(INVALID_SCHEDULE_CMD);
            const existed = await getRecordById(motorSchedules, scheduleId, ["id", "schedule_status"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            if (cmd === 1) {
                // Stop: only active schedules can be stopped
                const activeSchedule = await findActiveScheduleById(scheduleId);
                if (!activeSchedule)
                    throw new BadRequestException(NO_ACTIVE_SCHEDULE);
                await stopScheduleById(scheduleId);
                return sendResponse(c, 200, SCHEDULE_STOPPED);
            }
            // cmd === 2: Restart
            await restartScheduleById(scheduleId);
            return sendResponse(c, 200, SCHEDULE_RESTARTED);
        }
        catch (error) {
            console.error("Error at update schedule status:", error.message);
            handleJsonParseError(error);
            throw error;
        }
    };
    // =================== STOP ALL SCHEDULES FOR A MOTOR ===================
    stopAllMotorSchedulesHandler = async (c) => {
        try {
            const motorId = +c.req.param("motor_id");
            paramsValidateException.validateId(motorId, "motor id");
            const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], ["id"]);
            if (!existedMotor)
                throw new BadRequestException(MOTOR_NOT_FOUND);
            const activeSchedules = await findAllActiveSchedulesForMotor(existedMotor.id);
            if (!activeSchedules || activeSchedules.length === 0) {
                throw new BadRequestException(NO_ACTIVE_SCHEDULE);
            }
            const ids = activeSchedules.map(s => s.id);
            await cancelSchedulesByIds(ids);
            return sendResponse(c, 200, ALL_SCHEDULES_STOPPED, { cancelled_count: ids.length });
        }
        catch (error) {
            console.error("Error at stop all motor Schedules:", error.message);
            throw error;
        }
    };
    // =================== ADD REPEAT DAYS ===================
    addRepeatDaysHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const reqData = await c.req.json();
            const normalizedReqData = normalizeRepeatDaysPayload(reqData);
            const data = await validatedRequest("add-repeat-days", normalizedReqData, ADD_REPEAT_DAYS_VALIDATION_CRITERIA);
            const existed = await getRecordById(motorSchedules, scheduleId, ["id", "motor_id", "days_of_week", "start_time", "end_time"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            // Merge existing days with new days (deduplicated and sorted)
            const existingDays = existed.days_of_week || [];
            const mergedDays = [...new Set([...existingDays, ...data.days_of_week])].sort();
            // Re-check conflicts with expanded days
            const conflicts = await findConflictingSchedules(existed.motor_id, null, null, mergedDays, scheduleId);
            checkMotorScheduleConflict({ start_time: existed.start_time, end_time: existed.end_time, repeat: 1, days_of_week: mergedDays }, conflicts);
            await updateRecordById(motorSchedules, scheduleId, {
                days_of_week: mergedDays,
                bit_wise_days: data.bit_wise_days ?? 0,
            });
            return sendResponse(c, 200, REPEAT_DAYS_ADDED, { days_of_week: mergedDays });
        }
        catch (error) {
            console.error("Error at add repeat days:", error.message);
            throw error;
        }
    };
    updateAcknowledgementHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const existed = await getRecordById(motorSchedules, scheduleId, ["id"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            await updateRecordById(motorSchedules, scheduleId, {
                acknowledgement: 1,
                acknowledged_at: new Date(),
                schedule_status: "SCHEDULED",
            });
            return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED);
        }
        catch (error) {
            console.error("Error at update acknowledgement:", error.message);
            throw error;
        }
    };
    // =================== SYNC SCHEDULE STATUSES (CRON ENDPOINT) ===================
    syncScheduleStatusesHandler = async (c) => {
        try {
            const now = new Date();
            const schedules = await findEvaluatableSchedules();
            if (!schedules || schedules.length === 0) {
                return sendResponse(c, 200, SCHEDULE_STATUS_SYNC_COMPLETED, {
                    evaluated: 0,
                    updated: 0,
                    transitions: [],
                });
            }
            const transitions = [];
            const runningIds = [];
            const completedIds = [];
            const waitingIds = [];
            for (const schedule of schedules) {
                const result = evaluateScheduleStatus(schedule, now);
                if (!result)
                    continue;
                if (result.newStatus === "RUNNING")
                    runningIds.push(result.id);
                else if (result.newStatus === "COMPLETED")
                    completedIds.push(result.id);
                else if (result.newStatus === "WAITING_NEXT_CYCLE")
                    waitingIds.push(result.id);
                transitions.push({
                    schedule_id: result.id,
                    from: schedule.schedule_status,
                    to: result.newStatus,
                });
            }
            await batchUpdateScheduleStatuses([
                { status: "RUNNING", ids: runningIds, last_started_at: now },
                { status: "COMPLETED", ids: completedIds, last_stopped_at: now },
                { status: "WAITING_NEXT_CYCLE", ids: waitingIds, last_stopped_at: now },
            ]);
            return sendResponse(c, 200, SCHEDULE_STATUS_SYNC_COMPLETED, {
                evaluated: schedules.length,
                updated: transitions.length,
                transitions,
            });
        }
        catch (error) {
            console.error("Error at sync schedule statuses:", error.message);
            throw error;
        }
    };
    // =================== PENDING SCHEDULES FOR DEVICE SYNC (NO AUTH) ===================
    getPendingSchedulesForSyncHandler = async (c) => {
        try {
            const records = await findPendingSchedulesForSync();
            if (!records || records.length === 0) {
                return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, []);
            }
            const grouped = buildDeviceSyncPayloads(records);
            // Fetch all starters in a single query
            const starterIds = grouped.map(g => g.starter_id);
            const startersData = await db.select().from(starterBoxes).where(inArray(starterBoxes.id, starterIds));
            const starterMap = new Map(startersData.map(s => [s.id, s]));
            let totalDevices = 0;
            for (const { starter_id, chunks } of grouped) {
                const starterData = starterMap.get(starter_id);
                if (!starterData) {
                    console.error(`Starter not found for id=${starter_id}, skipping publish`);
                    continue;
                }
                totalDevices++;
                // Publish all chunks sequentially — await each so publishingMap clears before next chunk
                for (const { payload, dbIds } of chunks) {
                    const ackSuccess = await publishMultipleTimesInBackground(payload, starterData);
                    if (ackSuccess) {
                        await db.update(motorSchedules)
                            .set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() })
                            .where(inArray(motorSchedules.id, dbIds));
                        console.log(`Schedule chunk ACK success for starter_id=${starter_id}, idx=${payload.D.idx}, marked ${dbIds.length} schedules as SCHEDULED`);
                    }
                    else {
                        console.warn(`Schedule chunk ACK failed for starter_id=${starter_id}, idx=${payload.D.idx}, keeping ${dbIds.length} schedules for retry`);
                    }
                }
            }
            return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, {
                devices: totalDevices,
                total_chunks: grouped.reduce((sum, g) => sum + g.chunks.length, 0),
            });
        }
        catch (error) {
            console.error("Error at get pending schedules for sync:", error.message);
            throw error;
        }
    };
}
