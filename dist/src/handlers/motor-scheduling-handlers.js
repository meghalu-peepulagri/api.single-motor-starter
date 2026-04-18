import { inArray } from "drizzle-orm";
import { ACKNOWLEDGEMENT_UPDATED, ADD_REPEAT_DAYS_VALIDATION_CRITERIA, ALL_SCHEDULES_STOPPED, BULK_SCHEDULE_IDS_REQUIRED, BULK_SCHEDULES_DELETED, BULK_SCHEDULES_RESTARTED, BULK_SCHEDULES_STOPPED, CANNOT_EDIT_RUNNING_SCHEDULE, INVALID_SCHEDULE_CMD, MOTOR_NOT_FOUND, MULTIPLE_SCHEDULES_CREATED, NO_ACTIVE_SCHEDULE, PENDING_SCHEDULES_FETCHED, REPEAT_DAYS_ADDED, SCHEDULE_CMD_REQUIRED, SCHEDULE_DELETED, SCHEDULE_DETAILS_FETCHED, SCHEDULE_HISTORY_FETCHED, SCHEDULE_NOT_FOUND, SCHEDULE_RESTARTED, SCHEDULE_STATUS_SYNC_COMPLETED, SCHEDULE_STOPPED, SCHEDULE_UPDATED, SCHEDULED_CREATED, SCHEDULED_LIST_FETCHED, UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { checkMotorScheduleConflict, validateScheduleTypeRules } from "../helpers/motor-helper.js";
import { buildMotorScheduleFilters, buildScheduleHistoryFilters } from "../helpers/motor-schedule-filter-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { buildDeviceSyncPayloads, buildScheduleData, buildScheduleTimeline, formatMotorScheduleListResponse, formatMotorScheduleResponse, normalizeMotorSchedulePayload, normalizeRepeatDaysPayload, todayAsYYMMDD, } from "../helpers/motor-schedule-payload-helper.js";
import { evaluateScheduleStatus } from "../helpers/schedule-status-evaluator.js";
import { publishMultipleTimesInBackground } from "../helpers/settings-helpers.js";
import { getRecordById, getSingleRecordByMultipleColumnValues, updateRecordById } from "../services/db/base-db-services.js";
import { batchUpdateScheduleStatuses, bulkCreateMotorSchedules, cancelSchedulesByIds, findActiveScheduleById, findAllActiveSchedulesForMotor, findConflictingSchedules, findEvaluatableSchedules, findPendingSchedulesForSync, findScheduleHistoryByMotorAndStarter, findSchedulesByFilters, restartScheduleById, restartSchedulesByIds, stopScheduleById } from "../services/db/motor-schedules-services.js";
import { handleAppError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class MotorScheduleHandler {
    // =================== CREATE SCHEDULE ===================
    createMotorScheduleHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqData = await c.req.json();
            await bulkCreateMotorSchedules(reqData, userPayload.id);
            const isBulk = Array.isArray(reqData) && reqData.length > 1;
            return sendResponse(c, 201, isBulk ? MULTIPLE_SCHEDULES_CREATED : SCHEDULED_CREATED);
        }
        catch (error) {
            handleAppError(error, "create Motor Schedule");
        }
    };
    // =================== LIST SCHEDULES ===================
    motorScheduleListHandler = async (c) => {
        try {
            const query = c.req.query();
            const page = +(query.page) || 1;
            const limit = +(query.limit) || 10;
            const filters = buildMotorScheduleFilters(query);
            const result = await findSchedulesByFilters(filters, page, limit);
            return sendResponse(c, 200, SCHEDULED_LIST_FETCHED, formatMotorScheduleListResponse(result, filters.schedule_start_date));
        }
        catch (error) {
            handleAppError(error, "motor Schedule List");
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
            handleAppError(error, "get motor Schedule by id");
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
            const existed = await getRecordById(motorSchedules, scheduleId, ["id", "motor_id", "schedule_status"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            if (existed.schedule_status === "RUNNING")
                throw new BadRequestException(CANNOT_EDIT_RUNNING_SCHEDULE);
            validateScheduleTypeRules(data);
            const scheduleStartDate = data.schedule_start_date || todayAsYYMMDD();
            const existingSchedules = await findConflictingSchedules(existed.motor_id, data.repeat === 1 ? null : scheduleStartDate, data.repeat === 1 ? null : (data.schedule_end_date || scheduleStartDate), data.days_of_week || [], scheduleId);
            checkMotorScheduleConflict({ ...data, schedule_start_date: scheduleStartDate, schedule_end_date: data.schedule_end_date || scheduleStartDate }, existingSchedules);
            await updateRecordById(motorSchedules, scheduleId, buildScheduleData(data, scheduleStartDate));
            return sendResponse(c, 200, SCHEDULE_UPDATED);
        }
        catch (error) {
            handleAppError(error, "edit motor Schedule");
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
            if (existed.schedule_status === "RUNNING")
                await stopScheduleById(scheduleId);
            await updateRecordById(motorSchedules, existed.id, {
                schedule_status: "DELETED", deleted_by: userPayload.id, deleted_at: new Date(), status: "ARCHIVED", enabled: false,
            });
            return sendResponse(c, 200, SCHEDULE_DELETED);
        }
        catch (error) {
            handleAppError(error, "delete motor Schedule");
        }
    };
    // =================== UPDATE SCHEDULE STATUS ===================
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
                const active = await findActiveScheduleById(scheduleId);
                if (!active)
                    throw new BadRequestException(NO_ACTIVE_SCHEDULE);
                await stopScheduleById(scheduleId);
                return sendResponse(c, 200, SCHEDULE_STOPPED);
            }
            await restartScheduleById(scheduleId);
            return sendResponse(c, 200, SCHEDULE_RESTARTED);
        }
        catch (error) {
            handleAppError(error, "update schedule status");
        }
    };
    // =================== STOP ALL SCHEDULES ===================
    stopAllMotorSchedulesHandler = async (c) => {
        try {
            const motorId = +c.req.param("motor_id");
            paramsValidateException.validateId(motorId, "motor id");
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], ["id"]);
            if (!motor)
                throw new BadRequestException(MOTOR_NOT_FOUND);
            const active = await findAllActiveSchedulesForMotor(motor.id);
            if (!active || active.length === 0)
                throw new BadRequestException(NO_ACTIVE_SCHEDULE);
            const ids = active.map(s => s.id);
            await cancelSchedulesByIds(ids);
            return sendResponse(c, 200, ALL_SCHEDULES_STOPPED, { cancelled_count: ids.length });
        }
        catch (error) {
            handleAppError(error, "stop all motor Schedules");
        }
    };
    // =================== ADD REPEAT DAYS ===================
    addRepeatDaysHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const reqData = await c.req.json();
            const data = await validatedRequest("add-repeat-days", normalizeRepeatDaysPayload(reqData), ADD_REPEAT_DAYS_VALIDATION_CRITERIA);
            const existed = await getRecordById(motorSchedules, scheduleId, ["id", "motor_id", "days_of_week", "start_time", "end_time"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            const mergedDays = [...new Set([...(existed.days_of_week || []), ...data.days_of_week])].sort();
            const conflicts = await findConflictingSchedules(existed.motor_id, null, null, mergedDays, scheduleId);
            checkMotorScheduleConflict({ start_time: existed.start_time, end_time: existed.end_time, repeat: 1, days_of_week: mergedDays }, conflicts);
            await updateRecordById(motorSchedules, scheduleId, { days_of_week: mergedDays, bit_wise_days: data.bit_wise_days ?? 0 });
            return sendResponse(c, 200, REPEAT_DAYS_ADDED, { days_of_week: mergedDays });
        }
        catch (error) {
            handleAppError(error, "add repeat days");
        }
    };
    updateAcknowledgementHandler = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const existed = await getRecordById(motorSchedules, scheduleId, ["id"]);
            if (!existed)
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            await updateRecordById(motorSchedules, scheduleId, { acknowledgement: 1, acknowledged_at: new Date(), schedule_status: "SCHEDULED" });
            return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED);
        }
        catch (error) {
            handleAppError(error, "update acknowledgement");
        }
    };
    bulkUpdateAcknowledgementHandler = async (c) => {
        try {
            const data = await c.req.json();
            const scheduleIds = data.schedule_ids;
            if (!scheduleIds || !Array.isArray(scheduleIds) || scheduleIds.length === 0) {
                throw new BadRequestException("Array of schedule ids required");
            }
            await db.update(motorSchedules)
                .set({ acknowledgement: 1, acknowledged_at: new Date(), schedule_status: "SCHEDULED" })
                .where(inArray(motorSchedules.id, scheduleIds));
            return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED);
        }
        catch (error) {
            handleAppError(error, "bulk update acknowledgement");
        }
    };
    // =================== SCHEDULE HISTORY ===================
    getScheduleHistoryHandler = async (c) => {
        try {
            const query = c.req.query();
            const filters = buildScheduleHistoryFilters(query);
            const pageParams = getPaginationOffParams(query);
            const result = await findScheduleHistoryByMotorAndStarter(filters, pageParams);
            const records = result.records.map((record) => buildScheduleTimeline(record));
            return sendResponse(c, 200, SCHEDULE_HISTORY_FETCHED, {
                pagination: result.pagination,
                records
            });
        }
        catch (error) {
            handleAppError(error, "get schedule history");
        }
    };
    // =================== BULK STOP SCHEDULES ===================
    bulkStopSchedulesHandler = async (c) => {
        try {
            const { ids } = await c.req.json();
            if (!ids || !Array.isArray(ids) || ids.length === 0)
                throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);
            await cancelSchedulesByIds(ids);
            return sendResponse(c, 200, BULK_SCHEDULES_STOPPED, { stopped_count: ids.length });
        }
        catch (error) {
            handleAppError(error, "bulk stop schedules");
            throw error;
        }
    };
    // =================== BULK RESTART SCHEDULES ===================
    bulkRestartSchedulesHandler = async (c) => {
        try {
            const { ids } = await c.req.json();
            if (!ids || !Array.isArray(ids) || ids.length === 0)
                throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);
            await restartSchedulesByIds(ids);
            return sendResponse(c, 200, BULK_SCHEDULES_RESTARTED, { restarted_count: ids.length });
        }
        catch (error) {
            handleAppError(error, "bulk restart schedules");
            throw error;
        }
    };
    // =================== BULK DELETE SCHEDULES ===================
    bulkDeleteSchedulesHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const { ids } = await c.req.json();
            if (!ids || !Array.isArray(ids) || ids.length === 0)
                throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);
            await db.update(motorSchedules)
                .set({ schedule_status: "DELETED", deleted_by: userPayload.id, deleted_at: new Date(), status: "ARCHIVED", enabled: false, updated_at: new Date() })
                .where(inArray(motorSchedules.id, ids));
            return sendResponse(c, 200, BULK_SCHEDULES_DELETED, { deleted_count: ids.length });
        }
        catch (error) {
            handleAppError(error, "bulk delete schedules");
            throw error;
        }
    };
    // =================== SYNC STATUSES ===================
    syncScheduleStatusesHandler = async (c) => {
        try {
            const now = new Date();
            const schedules = await findEvaluatableSchedules();
            if (!schedules || schedules.length === 0)
                return sendResponse(c, 200, SCHEDULE_STATUS_SYNC_COMPLETED, { evaluated: 0, updated: 0, transitions: [] });
            const transitions = [];
            const groups = { RUNNING: [], COMPLETED: [], WAITING_NEXT_CYCLE: [] };
            for (const s of schedules) {
                const res = evaluateScheduleStatus(s, now);
                if (!res)
                    continue;
                groups[res.newStatus].push(res.id);
                transitions.push({ schedule_id: res.id, from: s.schedule_status, to: res.newStatus });
            }
            await batchUpdateScheduleStatuses([
                { status: "RUNNING", ids: groups.RUNNING, last_started_at: now },
                { status: "COMPLETED", ids: groups.COMPLETED, last_stopped_at: now },
                { status: "WAITING_NEXT_CYCLE", ids: groups.WAITING_NEXT_CYCLE, last_stopped_at: now },
            ]);
            return sendResponse(c, 200, SCHEDULE_STATUS_SYNC_COMPLETED, { evaluated: schedules.length, updated: transitions.length, transitions });
        }
        catch (error) {
            handleAppError(error, "sync schedule statuses");
        }
    };
    // =================== PENDING FOR SYNC ===================
    getPendingSchedulesForSyncHandler = async (c) => {
        try {
            const records = await findPendingSchedulesForSync();
            if (!records || records.length === 0)
                return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, []);
            const grouped = buildDeviceSyncPayloads(records);
            const starters = await db.select().from(starterBoxes).where(inArray(starterBoxes.id, grouped.map(g => g.starter_id)));
            const starterMap = new Map(starters.map(s => [s.id, s]));
            let totalDevices = 0, totalChunks = 0;
            for (const { starter_id, chunks } of grouped) {
                const starter = starterMap.get(starter_id);
                if (!starter)
                    continue;
                totalDevices++;
                for (const { payload, dbIds } of chunks) {
                    totalChunks++;
                    if (await publishMultipleTimesInBackground(payload, starter)) {
                        await db.update(motorSchedules).set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() }).where(inArray(motorSchedules.id, dbIds));
                    }
                }
            }
            return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, { devices: totalDevices, total_chunks: totalChunks });
        }
        catch (error) {
            handleAppError(error, "get pending schedules for sync");
        }
    };
}
