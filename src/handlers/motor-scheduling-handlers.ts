import { inArray } from "drizzle-orm";
import type { Context } from "hono";
import {
  ACKNOWLEDGEMENT_UPDATED,
  ADD_REPEAT_DAYS_VALIDATION_CRITERIA,
  ALL_SCHEDULES_STOPPED,
  CANNOT_EDIT_RUNNING_SCHEDULE,
  CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
  MOTOR_NOT_FOUND,
  NO_ACTIVE_SCHEDULE,
  PENDING_SCHEDULES_FETCHED,
  REPEAT_DAYS_ADDED,
  INVALID_SCHEDULE_CMD,
  SCHEDULE_CMD_REQUIRED,
  SCHEDULE_DELETED,
  SCHEDULE_DETAILS_FETCHED,
  SCHEDULE_NOT_FOUND,
  SCHEDULE_RESTARTED,
  SCHEDULE_STOPPED,
  SCHEDULE_UPDATED,
  SCHEDULED_CREATED,
  SCHEDULED_LIST_FETCHED,
  SCHEDULE_STATUS_SYNC_COMPLETED,
  UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA
} from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motorSchedules, type MotorSchedule, type MotorScheduleTable } from "../database/schemas/motor-schedules.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import {
  checkMotorScheduleConflict,
  validateScheduleTypeRules,
} from "../helpers/motor-helper.js";
import { evaluateScheduleStatus } from "../helpers/schedule-status-evaluator.js";
import type { ScheduleForEvaluation } from "../types/app-types.js";
import { buildMotorScheduleFilters } from "../helpers/motor-schedule-filter-helper.js";
import {
  buildDeviceSyncPayloads,
  buildScheduleData,
  formatMotorScheduleListResponse,
  formatMotorScheduleResponse,
  normalizeMotorSchedulePayload,
  normalizeRepeatDaysPayload,
} from "../helpers/motor-schedule-payload-helper.js";
import {
  getRecordById,
  getSingleRecordByMultipleColumnValues,
  saveSingleRecord,
  updateRecordById
} from "../services/db/base-db-services.js";
import {
  batchUpdateScheduleStatuses,
  cancelSchedulesByIds,
  findActiveScheduleById,
  findAllActiveSchedulesForMotor,
  findConflictingSchedules,
  findEvaluatableSchedules,
  findPendingSchedulesForSync,
  findSchedulesByFilters,
  getNextScheduleIdForMotor,
  restartScheduleById,
  stopScheduleById
} from "../services/db/motor-schedules-services.js";
import { publishData } from "../services/db/mqtt-db-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type {
  ValidatedAddRepeatDays,
  ValidatedMotorSchedule,
} from "../validations/schema/motor-schedule-validators.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();

export class MotorScheduleHandler {

  // =================== CREATE SCHEDULE ===================
  createMotorScheduleHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const reqData = await c.req.json();
      const normalizedReqData = normalizeMotorSchedulePayload(reqData);
      const data = await validatedRequest<ValidatedMotorSchedule>(
        "create-motor-schedule", normalizedReqData, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
      );

      // Verify motor exists and is not archived
      const existedMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(
        motors, ["id", "status"], ["=", "!="], [data.motor_id, "ARCHIVED"], ["id"],
      );
      if (!existedMotor) throw new BadRequestException(MOTOR_NOT_FOUND);

      validateScheduleTypeRules(data);

      // Use user-provided schedule_start_date for one-time schedules, fallback to today
      const scheduleStartDate = data.schedule_start_date || new Date().toISOString().split("T")[0];

      // Conflict detection: fetch potential conflicts by date/days, then check time overlap
      const conflictDate = data.repeat === 1 ? null : scheduleStartDate;
      const existingSchedules = await findConflictingSchedules(
        existedMotor.id, conflictDate, data.days_of_week || [],
      );
      checkMotorScheduleConflict(
        { ...data, schedule_start_date: scheduleStartDate },
        existingSchedules,
      );

      // Auto-increment schedule_id per motor
      const nextScheduleId = await getNextScheduleIdForMotor(data.motor_id);

      // Prepare and save
      const preparedData = {
        ...buildScheduleData(data, scheduleStartDate),
        schedule_id: nextScheduleId,
        created_by: userPayload.id,
        enabled: data.enabled ?? true,
      };

      const savedSchedule = await saveSingleRecord<MotorScheduleTable>(motorSchedules, preparedData);
      return sendResponse(c, 201, SCHEDULED_CREATED, savedSchedule);
    } catch (error: any) {
      console.error("Error at create Motor Schedule:", error.message);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at create Motor Schedule:", error.message);
      throw error;
    }
  };

  // =================== LIST SCHEDULES (with filters) ===================
  motorScheduleListHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const page = +(query.page) || 1;
      const limit = +(query.limit) || 10;

      const filters = buildMotorScheduleFilters(query);

      const result = await findSchedulesByFilters(filters, page, limit);
      return sendResponse(c, 200, SCHEDULED_LIST_FETCHED, formatMotorScheduleListResponse(result));
    } catch (error: any) {
      console.error("Error at motor Schedule List:", error.message);
      throw error;
    }
  };

  // =================== GET SINGLE SCHEDULE ===================
  getMotorScheduleByIdHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const schedule = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId);
      if (!schedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      return sendResponse(c, 200, SCHEDULE_DETAILS_FETCHED, formatMotorScheduleResponse(schedule));
    } catch (error: any) {
      console.error("Error at get motor Schedule by id:", error.message);
      throw error;
    }
  };

  // =================== EDIT SCHEDULE ===================
  editMotorScheduleHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const reqData = await c.req.json();
      const normalizedReqData = normalizeMotorSchedulePayload(reqData);
      const data = await validatedRequest<ValidatedMotorSchedule>(
        "update-motor-schedule", normalizedReqData, UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
      );

      const existedSchedule = await getRecordById<MotorScheduleTable>(
        motorSchedules, scheduleId, ["id", "motor_id", "schedule_status"],
      ) as Pick<MotorSchedule, "id" | "motor_id" | "schedule_status"> | null;
      if (!existedSchedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      // Cannot edit a RUNNING schedule
      if (existedSchedule.schedule_status === "RUNNING") {
        throw new BadRequestException(CANNOT_EDIT_RUNNING_SCHEDULE);
      }

      validateScheduleTypeRules(data);

      // Conflict detection: fetch potential conflicts by date/days, then check time overlap
      const scheduleStartDate = data.schedule_start_date || new Date().toISOString().split("T")[0];
      const conflictDate = data.repeat === 1 ? null : scheduleStartDate;
      const existingSchedules = await findConflictingSchedules(
        existedSchedule.motor_id, conflictDate, data.days_of_week || [], scheduleId,
      );
      checkMotorScheduleConflict(
        { ...data, schedule_start_date: scheduleStartDate },
        existingSchedules,
      );

      // Update
      const updateData = buildScheduleData(data, scheduleStartDate);

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, updateData);
      return sendResponse(c, 200, SCHEDULE_UPDATED);
    } catch (error: any) {
      console.error("Error at edit motor Schedule:", error.message);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

  // =================== DELETE SCHEDULE ===================
  deleteMotorScheduleHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const existed = await getRecordById<MotorScheduleTable>(
        motorSchedules, scheduleId, ["id", "schedule_status"],
      ) as Pick<MotorSchedule, "id" | "schedule_status"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      // If schedule is RUNNING, stop it first (no compensation)
      if (existed.schedule_status === "RUNNING") {
        await stopScheduleById(scheduleId);
      }

      // Soft delete: mark as DELETED with deleted_by user
      await updateRecordById<MotorScheduleTable>(motorSchedules, existed.id, {
        schedule_status: "DELETED",
        deleted_by: userPayload.id,
        status: "ARCHIVED",
        enabled: false,
      });
      return sendResponse(c, 200, SCHEDULE_DELETED);
    } catch (error: any) {
      console.error("Error at delete motor Schedule:", error.message);
      throw error;
    }
  };

  // =================== UPDATE SCHEDULE STATUS (STOP / RESTART) ===================
  // cmd: 1 = Stop, 2 = Restart
  updateScheduleStatusHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const { cmd } = await c.req.json();
      if (cmd === undefined || cmd === null) throw new BadRequestException(SCHEDULE_CMD_REQUIRED);
      if (cmd !== 1 && cmd !== 2) throw new BadRequestException(INVALID_SCHEDULE_CMD);

      const existed = await getRecordById<MotorScheduleTable>(
        motorSchedules, scheduleId, ["id", "schedule_status"],
      );
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      if (cmd === 1) {
        // Stop: only active schedules can be stopped
        const activeSchedule = await findActiveScheduleById(scheduleId);
        if (!activeSchedule) throw new BadRequestException(NO_ACTIVE_SCHEDULE);

        await stopScheduleById(scheduleId);
        return sendResponse(c, 200, SCHEDULE_STOPPED);
      }

      // cmd === 2: Restart
      await restartScheduleById(scheduleId);
      return sendResponse(c, 200, SCHEDULE_RESTARTED);
    } catch (error: any) {
      console.error("Error at update schedule status:", error.message);
      handleJsonParseError(error);
      throw error;
    }
  };

  // =================== STOP ALL SCHEDULES FOR A MOTOR ===================
  stopAllMotorSchedulesHandler = async (c: Context) => {
    try {
      const motorId = +c.req.param("motor_id");
      paramsValidateException.validateId(motorId, "motor id");

      const existedMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(
        motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], ["id"],
      );
      if (!existedMotor) throw new BadRequestException(MOTOR_NOT_FOUND);

      const activeSchedules = await findAllActiveSchedulesForMotor(existedMotor.id);
      if (!activeSchedules || activeSchedules.length === 0) {
        throw new BadRequestException(NO_ACTIVE_SCHEDULE);
      }

      const ids = activeSchedules.map(s => s.id);
      await cancelSchedulesByIds(ids);

      return sendResponse(c, 200, ALL_SCHEDULES_STOPPED, { cancelled_count: ids.length });
    } catch (error: any) {
      console.error("Error at stop all motor Schedules:", error.message);
      throw error;
    }
  };

  // =================== ADD REPEAT DAYS ===================
  addRepeatDaysHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const reqData = await c.req.json();
      const normalizedReqData = normalizeRepeatDaysPayload(reqData);
      const data = await validatedRequest<ValidatedAddRepeatDays>(
        "add-repeat-days", normalizedReqData, ADD_REPEAT_DAYS_VALIDATION_CRITERIA,
      );

      const existed = await getRecordById<MotorScheduleTable>(
        motorSchedules, scheduleId,
        ["id", "motor_id", "days_of_week", "start_time", "end_time"],
      ) as Pick<MotorSchedule, "id" | "motor_id" | "days_of_week" | "start_time" | "end_time"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      // Merge existing days with new days (deduplicated and sorted)
      const existingDays: number[] = existed.days_of_week || [];
      const mergedDays = [...new Set([...existingDays, ...data.days_of_week])].sort();

      // Re-check conflicts with expanded days
      const conflicts = await findConflictingSchedules(
        existed.motor_id, null, mergedDays, scheduleId,
      );
      checkMotorScheduleConflict(
        { start_time: existed.start_time, end_time: existed.end_time, repeat: 1, days_of_week: mergedDays },
        conflicts,
      );

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, {
        days_of_week: mergedDays,
        bit_wise_days: data.bit_wise_days ?? 0,
      });

      return sendResponse(c, 200, REPEAT_DAYS_ADDED, { days_of_week: mergedDays });
    } catch (error: any) {
      console.error("Error at add repeat days:", error.message);
      throw error;
    }
  };

  updateAcknowledgementHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const existed = await getRecordById<MotorScheduleTable>(
        motorSchedules, scheduleId, ["id"],
      );
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, {
        acknowledgement: 1,
        acknowledged_at: new Date(),
        schedule_status: "SCHEDULED",
      });

      return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED);
    } catch (error: any) {
      console.error("Error at update acknowledgement:", error.message);
      throw error;
    }
  };


  // =================== SYNC SCHEDULE STATUSES (CRON ENDPOINT) ===================
  syncScheduleStatusesHandler = async (c: Context) => {
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

      const transitions: Array<{ schedule_id: number; from: string; to: string }> = [];
      const runningIds: number[] = [];
      const completedIds: number[] = [];
      const waitingIds: number[] = [];

      for (const schedule of schedules) {
        const result = evaluateScheduleStatus(schedule as ScheduleForEvaluation, now);
        if (!result) continue;

        if (result.newStatus === "RUNNING") runningIds.push(result.id);
        else if (result.newStatus === "COMPLETED") completedIds.push(result.id);
        else if (result.newStatus === "WAITING_NEXT_CYCLE") waitingIds.push(result.id);

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
    } catch (error: any) {
      console.error("Error at sync schedule statuses:", error.message);
      throw error;
    }
  };

  // =================== PENDING SCHEDULES FOR DEVICE SYNC (NO AUTH) ===================
  getPendingSchedulesForSyncHandler = async (c: Context) => {
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

      let totalPublished = 0;
      for (const { starter_id, chunks } of grouped) {
        const starterData = starterMap.get(starter_id);
        if (!starterData) {
          console.error(`Starter not found for id=${starter_id}, skipping publish`);
          continue;
        }

        for (const chunk of chunks) {
          publishData(chunk, starterData);
          totalPublished++;
          console.log(`Published chunk to starter_id=${starter_id}, items=${chunk.length}, bytes=${Buffer.byteLength(JSON.stringify(chunk), "utf8")}`);
        }
      }

      return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, { devices: grouped.length, payloads_published: totalPublished });
    } catch (error: any) {
      console.error("Error at get pending schedules for sync:", error.message);
      throw error;
    }
  };
}
