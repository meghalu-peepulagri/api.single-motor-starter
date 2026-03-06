import type { Context } from "hono";
import {
  ACKNOWLEDGEMENT_UPDATED,
  ADD_REPEAT_DAYS_VALIDATION_CRITERIA,
  ALL_SCHEDULES_STOPPED,
  CANNOT_EDIT_RUNNING_SCHEDULE,
  CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
  INVALID_ACK_PAYLOAD,
  INVALID_ACK_STATUS,
  MOTOR_NOT_FOUND,
  NO_ACTIVE_SCHEDULE,
  REPEAT_DAYS_ADDED,
  SCHEDULE_ACK_FAILED,
  SCHEDULE_ACK_SUCCESS,
  SCHEDULE_DELETED,
  SCHEDULE_DETAILS_FETCHED,
  SCHEDULE_NOT_FOUND,
  SCHEDULE_RESTARTED,
  SCHEDULE_STOPPED,
  SCHEDULE_UPDATED,
  SCHEDULED_CREATED,
  PENDING_SCHEDULES_FETCHED,
  SCHEDULED_LIST_FETCHED,
  UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA
} from "../constants/app-constants.js";
import { motorSchedules, type MotorScheduleTable } from "../database/schemas/motor-schedules.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import {
  checkMotorScheduleConflict,
} from "../helpers/motor-helper.js";
import {
  buildDeviceSyncPayloads,
  encodeDaysMask,
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
  cancelSchedulesByIds,
  findActiveScheduleById,
  findAllActiveSchedulesForMotor,
  findConflictingSchedules,
  findPendingSchedulesForSync,
  findScheduleByScheduleId,
  findSchedulesByFilters,
  getNextScheduleIdForMotor,
  restartScheduleById,
  stopScheduleById,
} from "../services/db/motor-schedules-services.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import db from "../database/configuration.js";
import { inArray } from "drizzle-orm";
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

      // Use user-provided schedule_date for one-time schedules, fallback to today
      const scheduleDate = data.schedule_date || new Date().toISOString().split("T")[0];

      // Conflict detection: repeat schedules check only days_of_week, one-time checks schedule_date
      const conflictDate = data.repeat === 1 ? null : scheduleDate;
      const existingSchedules = await findConflictingSchedules(
        existedMotor.id, conflictDate, data.days_of_week || [],
      );
      checkMotorScheduleConflict(data, existingSchedules);

      // Auto-increment schedule_id per motor
      const nextScheduleId = await getNextScheduleIdForMotor(data.motor_id);

      // Prepare and save
      const preparedData = {
        motor_id: data.motor_id,
        starter_id: data.starter_id || null,
        schedule_id: nextScheduleId,
        schedule_type: data.schedule_type || "TIME_BASED",
        schedule_date: data.schedule_date,
        start_time: data.start_time,
        end_time: data.end_time,
        days_of_week: data.days_of_week || [],
        bit_wise_days: data.bit_wise_days ?? 0,
        runtime_minutes: data.runtime_minutes || null,
        cycle_on_minutes: data.cycle_on_minutes || null,
        cycle_off_minutes: data.cycle_off_minutes || null,
        power_loss_recovery: data.power_loss_recovery || false,
        repeat: data.repeat ?? 0,
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

      const filters: { starter_id?: number; motor_id?: number; status?: string, type?: string } = {};

      if (query.starter_id) {
        const starterId = +query.starter_id;
        if (Number.isNaN(starterId) || starterId <= 0) {
          throw new BadRequestException("Invalid starter id");
        }
        filters.starter_id = starterId;
      }

      if (query.motor_id) {
        const motorId = +query.motor_id;
        if (Number.isNaN(motorId) || motorId <= 0) {
          throw new BadRequestException("Invalid motor id");
        }
        filters.motor_id = motorId;
      }

      if (query.status) {
        filters.status = query.status;
      }

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
      );
      if (!existedSchedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      // Cannot edit a RUNNING schedule
      if ((existedSchedule as any).schedule_status === "RUNNING") {
        throw new BadRequestException(CANNOT_EDIT_RUNNING_SCHEDULE);
      }

      // Conflict detection: repeat schedules check only days_of_week, one-time checks schedule_date
      const scheduleDate = data.schedule_date || new Date().toISOString().split("T")[0];
      const conflictDate = data.repeat === 1 ? null : scheduleDate;
      const existingSchedules = await findConflictingSchedules(
        (existedSchedule as any).motor_id, conflictDate, data.days_of_week || [], scheduleId,
      );
      checkMotorScheduleConflict(data, existingSchedules);

      // Update
      const updateData = {
        motor_id: data.motor_id,
        starter_id: data.starter_id || null,
        schedule_type: data.schedule_type || "TIME_BASED",
        schedule_date: scheduleDate,
        start_time: data.start_time,
        end_time: data.end_time,
        days_of_week: data.days_of_week || [],
        bit_wise_days: data.bit_wise_days ?? 0,
        runtime_minutes: data.runtime_minutes || null,
        cycle_on_minutes: data.cycle_on_minutes || null,
        cycle_off_minutes: data.cycle_off_minutes || null,
        power_loss_recovery: data.power_loss_recovery ?? false,
        repeat: data.repeat ?? 0,
      };

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, updateData);
      return sendResponse(c, 200, SCHEDULE_UPDATED);
    } catch (error: any) {
      console.error("Error at edit motor Schedule:", error.message);
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
      );
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      // If schedule is RUNNING, stop it first (no compensation)
      if ((existed as any).schedule_status === "RUNNING") {
        await stopScheduleById(scheduleId);
      }

      // Soft delete: mark as DELETED with deleted_by user
      await updateRecordById<MotorScheduleTable>(motorSchedules, (existed as any).id, {
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

  // =================== STOP SINGLE SCHEDULE ===================
  stopMotorScheduleHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const activeSchedule = await findActiveScheduleById(scheduleId);
      if (!activeSchedule) throw new BadRequestException(NO_ACTIVE_SCHEDULE);

      const stopped = await stopScheduleById(scheduleId);
      return sendResponse(c, 200, SCHEDULE_STOPPED, formatMotorScheduleResponse(stopped?.[0]));
    } catch (error: any) {
      console.error("Error at stop motor Schedule:", error.message);
      throw error;
    }
  };

  // =================== RESTART SINGLE SCHEDULE ===================
  restartMotorScheduleHandler = async (c: Context) => {
    try {
      const scheduleId = +c.req.param("id");
      paramsValidateException.validateId(scheduleId, "schedule id");

      const existed = await getRecordById<MotorScheduleTable>(
        motorSchedules, scheduleId, ["id", "schedule_status"],
      );
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      const restarted = await restartScheduleById(scheduleId);
      return sendResponse(c, 200, SCHEDULE_RESTARTED, formatMotorScheduleResponse(restarted?.[0]));
    } catch (error: any) {
      console.error("Error at restart motor Schedule:", error.message);
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
      );
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      const schedule = existed as any;

      // Merge existing days with new days (deduplicated and sorted)
      const existingDays: number[] = schedule.days_of_week || [];
      const mergedDays = [...new Set([...existingDays, ...data.days_of_week])].sort();

      // Re-check conflicts with expanded days
      const conflicts = await findConflictingSchedules(
        schedule.motor_id, null, mergedDays, scheduleId,
      );
      checkMotorScheduleConflict(
        { start_time: schedule.start_time, end_time: schedule.end_time },
        conflicts,
      );

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, {
        days_of_week: mergedDays,
        bit_wise_days: encodeDaysMask(mergedDays),
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

      const updated = await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, {
        acknowledgement: 1,
        acknowledged_at: new Date(),
      });

      return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED, updated);
    } catch (error: any) {
      console.error("Error at update acknowledgement:", error.message);
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
          publishData(chunk, starterData as any);
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
