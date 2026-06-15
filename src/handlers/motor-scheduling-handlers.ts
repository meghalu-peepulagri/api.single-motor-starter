import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Context } from "hono";
import {
  ACKNOWLEDGEMENT_UPDATED,
  ADD_REPEAT_DAYS_VALIDATION_CRITERIA,
  ALL_SCHEDULES_STOPPED,
  BULK_SCHEDULE_IDS_REQUIRED,
  BULK_SCHEDULES_DELETED,
  BULK_SCHEDULES_RESTARTED,
  BULK_SCHEDULES_STOPPED,
  INVALID_SCHEDULE_CMD,
  MOTOR_NOT_FOUND,
  MULTIPLE_SCHEDULES_CREATED,
  NO_ACTIVE_SCHEDULE,
  PENDING_SCHEDULES_FETCHED,
  REPEAT_DAYS_ADDED,
  SCHEDULE_CMD_REQUIRED,
  SCHEDULE_DELETED,
  SCHEDULE_DETAILS_FETCHED,
  SCHEDULE_DEVICE_OFFLINE,
  SCHEDULE_HISTORY_FETCHED,
  SCHEDULE_LIVE_DATA_FETCHED,
  SCHEDULE_LIVE_DATA_NOT_FOUND,
  SCHEDULE_LOGS_FETCHED,
  SCHEDULE_NOT_FOUND,
  SCHEDULE_OPERATIONS_FETCHED,
  SCHEDULE_REPUBLISH_FAILED,
  SCHEDULE_REPUBLISH_NOT_ALLOWED,
  SCHEDULE_REPUBLISHED,
  SCHEDULE_RESTARTED,
  SCHEDULED_LIST_FETCHED,
  SCHEDULE_STATUS_SYNC_COMPLETED,
  SCHEDULE_STOPPED,
  SCHEDULE_UPDATED,
  SCHEDULED_CREATED,
  UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
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
import { buildMotorScheduleFilters, buildScheduleHistoryFilters } from "../helpers/motor-schedule-filter-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import {
  buildDeviceSyncPayloads,
  buildScheduleData,
  buildScheduleTimeline,
  dateToYYMMDD,
  formatMotorScheduleListResponse,
  formatMotorScheduleResponse,
  normalizeMotorSchedulePayload,
  normalizeRepeatDaysPayload,
  todayAsYYMMDD,
} from "../helpers/motor-schedule-payload-helper.js";
import { evaluateScheduleStatus } from "../helpers/schedule-status-evaluator.js";
import { publishMultipleTimesInBackground } from "../helpers/settings-helpers.js";
import { schedulePartialAckMap } from "../helpers/ack-tracker-hepler.js";
import { pushPendingSchedulesForStarter } from "../helpers/schedule-sync-helper.js";
import {
  getRecordById,
  getSingleRecordByMultipleColumnValues,
  updateRecordById,
} from "../services/db/base-db-services.js";
import {
  findOperationsByScheduleId,
  insertScheduleOperation,
  updateOperationAck,
} from "../services/db/motor-schedule-operations-services.js";
import {
  findScheduleLogsByScheduleId,
  insertScheduleLog,
} from "../services/db/motor-schedule-logs-services.js";
import {
  findScheduleLiveData,
} from "../services/db/motor-schedule-live-data-services.js";
import {
  assignDeviceScheduleIds,
  syncLastDeviceScheduleId,
  batchUpdateScheduleStatuses,
  bulkCreateMotorSchedules,
  cancelSchedulesByIds,
  deleteDayFromSchedule,
  evaluateAndUpdateSchedulesOnRead,
  findActiveScheduleById,
  findAllActiveSchedulesForMotor,
  findConflictingSchedules,
  findEvaluatableSchedules,
  findAndDeleteExpiredSchedules,
  findMaxAckedEndDatePerStarter,
  findPendingSchedulesForRepublish,
  findPendingSchedulesForSync,
  findScheduleHistoryByMotorAndStarter,
  findSchedulesByFilters,
  restartDayInSchedule,
  restartScheduleById,
  restartSchedulesByIds,
  stopDayInSchedule,
  stopScheduleById,
} from "../services/db/motor-schedules-services.js";
import type { ScheduleForEvaluation } from "../types/app-types.js";
import { ActivityService } from "../services/db/activity-service.js";
import { handleAppError } from "../utils/on-error.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";
import type {
  ValidatedAddRepeatDays,
  ValidatedMotorSchedule,
} from "../validations/schema/motor-schedule-validators.js";
import { validatedRequest } from "../validations/validate-request.js";
import { formatHHMM, formatYYMMDD, formatScheduleDateTime } from "../helpers/motor-schedule-helpers.js";

const paramsValidateException = new ParamsValidateException();

async function triggerSyncForCreatedSchedules(records: any[]) {
  const today = todayAsYYMMDD();
  const windowEnd = dateToYYMMDD(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
  const arr = Array.isArray(records) ? records : [records];

  const starterIds = [...new Set(
    arr
      .filter(r => r.starter_id && r.schedule_start_date >= today && r.schedule_start_date <= windowEnd)
      .map(r => r.starter_id as number),
  )];
  if (starterIds.length === 0) return;

  const starters = await db.query.starterBoxes.findMany({
    where: (s, { inArray: inArr, ne: n }) => inArr(s.id, starterIds),
    columns: { id: true, mac_address: true, pcb_number: true, device_allocation: true },
  });

  await Promise.allSettled(starters.map(s => pushPendingSchedulesForStarter(s as any)));
}

export class MotorScheduleHandler {

  // =================== CREATE SCHEDULE ===================
  createMotorScheduleHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const reqData = await c.req.json();

      const created = await bulkCreateMotorSchedules(reqData, userPayload.id);

      // Fire background sync for any newly created schedules that fall in the 3-day window
      setImmediate(() => { triggerSyncForCreatedSchedules(created).catch(() => null); });

      const isBulk = Array.isArray(reqData) && reqData.length > 1;
      const logNewData: Record<string, unknown> = { count: isBulk ? reqData.length : 1 };
      if (!isBulk) {
        const singleData = Array.isArray(reqData) ? reqData[0] : reqData;
        if (singleData?.starter_id) {
          const starterForLog = await getRecordById(starterBoxes, singleData.starter_id, ["pcb_number"]) as { pcb_number: string | null } | null;
          if (starterForLog?.pcb_number) logNewData.pcb_number = starterForLog.pcb_number;
        }
        const startDt = formatScheduleDateTime(singleData?.schedule_start_date, singleData?.start_time);
        const endDt = formatScheduleDateTime(singleData?.schedule_end_date ?? singleData?.schedule_start_date, singleData?.end_time);
        if (startDt) logNewData.start_datetime = startDt;
        if (endDt) logNewData.end_datetime = endDt;
      }
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: isBulk ? "SCHEDULES_BULK_CREATED" : "SCHEDULE_CREATED",
        entityType: "SCHEDULE",
        newData: logNewData,
      });
      return sendResponse(c, 201, isBulk ? MULTIPLE_SCHEDULES_CREATED : SCHEDULED_CREATED);
    } catch (error: any) {
      handleAppError(error, "create Motor Schedule");
    }
  };

  // =================== LIST SCHEDULES ===================
  motorScheduleListHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const page = +(query.page) || 1;
      const limit = +(query.limit) || 10;

      const filters = buildMotorScheduleFilters(query);
      const result = await findSchedulesByFilters(filters, page, limit);

      await evaluateAndUpdateSchedulesOnRead(result.records);

      return sendResponse(c, 200, SCHEDULED_LIST_FETCHED, formatMotorScheduleListResponse(result, filters.schedule_start_date));
    } catch (error: any) {
      handleAppError(error, "motor Schedule List");
    }
  };

  // =================== GET SINGLE SCHEDULE ===================
  getMotorScheduleByIdHandler = async (c: Context) => {
    try {
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const schedule = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId);
      if (!schedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      await evaluateAndUpdateSchedulesOnRead([schedule]);

      return sendResponse(c, 200, SCHEDULE_DETAILS_FETCHED, formatMotorScheduleResponse(schedule));
    } catch (error: any) {
      handleAppError(error, "get motor Schedule by id");
    }
  };

  // =================== EDIT SCHEDULE ===================
  editMotorScheduleHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const reqData = await c.req.json();
      const normalizedReqData = normalizeMotorSchedulePayload(reqData);
      const data = await validatedRequest<ValidatedMotorSchedule>(
        "update-motor-schedule", normalizedReqData, UPDATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA,
      );

      const existed = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, [
        "id", "motor_id", "schedule_status", "start_time", "end_time", "schedule_start_date", "schedule_end_date", "starter_id"
      ]) as Pick<MotorSchedule, "id" | "motor_id" | "schedule_status" | "start_time" | "end_time" | "schedule_start_date" | "schedule_end_date" | "starter_id"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      validateScheduleTypeRules(data);

      const scheduleStartDate = data.schedule_start_date || todayAsYYMMDD();
      const existingSchedules = await findConflictingSchedules(
        existed.motor_id, data.repeat === 1 ? null : scheduleStartDate, data.repeat === 1 ? null : (data.schedule_end_date || scheduleStartDate), data.days_of_week || [], scheduleId,
      );
      checkMotorScheduleConflict({ ...data, schedule_start_date: scheduleStartDate, schedule_end_date: data.schedule_end_date || scheduleStartDate }, existingSchedules);

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, { ...buildScheduleData(data, scheduleStartDate), edited_at: new Date() });

      let pcbForEditLog: string | null = null;
      if (existed.starter_id) {
        const starterForLog = await getRecordById(starterBoxes, existed.starter_id, ["pcb_number"]) as { pcb_number: string | null } | null;
        pcbForEditLog = starterForLog?.pcb_number ?? null;
      }
      const changedParts: string[] = [];
      if (data.start_time !== existed.start_time) changedParts.push(`Start time: ${formatHHMM(existed.start_time)} → ${formatHHMM(data.start_time)}`);
      if (data.end_time !== existed.end_time) changedParts.push(`End time: ${formatHHMM(existed.end_time)} → ${formatHHMM(data.end_time)}`);
      if (scheduleStartDate !== existed.schedule_start_date) changedParts.push(`Start date: ${formatYYMMDD(existed.schedule_start_date)} → ${formatYYMMDD(scheduleStartDate)}`);
      if (data.schedule_end_date && data.schedule_end_date !== existed.schedule_end_date) changedParts.push(`End date: ${formatYYMMDD(existed.schedule_end_date)} → ${formatYYMMDD(data.schedule_end_date)}`);
      const editLogNewData: Record<string, unknown> = {
        ...buildScheduleData(data, scheduleStartDate) as Record<string, unknown>,
        ...(pcbForEditLog && { pcb_number: pcbForEditLog }),
        ...(changedParts.length > 0 && { changes: changedParts.join(', ') }),
      };
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULE_UPDATED",
        entityType: "SCHEDULE",
        entityId: scheduleId,
        oldData: { schedule_status: existed.schedule_status },
        newData: editLogNewData,
      });
      return sendResponse(c, 200, SCHEDULE_UPDATED);
    } catch (error: any) {
      handleAppError(error, "edit motor Schedule");
    }
  };

  // =================== DELETE SCHEDULE ===================
  deleteMotorScheduleHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const existed = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, [
        "id", "schedule_status", "acknowledgement", "start_time", "end_time", "schedule_start_date", "starter_id"
      ]) as Pick<MotorSchedule, "id" | "schedule_status" | "acknowledgement" | "start_time" | "end_time" | "schedule_start_date" | "starter_id"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      let pcbForDeleteLog: string | null = null;
      if (existed.starter_id) {
        const starterForLog = await getRecordById(starterBoxes, existed.starter_id, ["pcb_number"]) as { pcb_number: string | null } | null;
        pcbForDeleteLog = starterForLog?.pcb_number ?? null;
      }
      const deleteStartDt = formatScheduleDateTime(existed.schedule_start_date, existed.start_time);

      await updateRecordById<MotorScheduleTable>(motorSchedules, existed.id, {
        schedule_status: "DELETED", deleted_by: userPayload.id, deleted_at: new Date(), status: "ARCHIVED", enabled: false,
      });

      if (existed.starter_id) {
        syncLastDeviceScheduleId(existed.starter_id).catch(() => null);
      }

      if (existed.acknowledgement === 1) {
        await Promise.all([
          insertScheduleOperation({ schedule_id: scheduleId, operation: "DELETE", sent_at: new Date() }).catch(() => null),
          insertScheduleLog({ schedule_id: scheduleId, event_type: "DELETE_SENT", actor_type: "user", actor_id: userPayload.id, old_status: existed.schedule_status }).catch(() => null),
        ]);
      } else {
        insertScheduleLog({ schedule_id: scheduleId, event_type: "STATUS_CHANGED", actor_type: "user", actor_id: userPayload.id, old_status: existed.schedule_status, new_status: "DELETED" }).catch(() => null);
      }
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULE_DELETED",
        entityType: "SCHEDULE",
        entityId: scheduleId,
        oldData: {
          schedule_status: existed.schedule_status,
          ...(pcbForDeleteLog && { pcb_number: pcbForDeleteLog }),
          ...(deleteStartDt && { start_datetime: deleteStartDt }),
        },
      });
      return sendResponse(c, 200, SCHEDULE_DELETED);
    } catch (error: any) {
      handleAppError(error, "delete motor Schedule");
    }
  };

  // =================== UPDATE SCHEDULE STATUS ===================
  updateScheduleStatusHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const { cmd } = await c.req.json();
      if (cmd === undefined || cmd === null) throw new BadRequestException(SCHEDULE_CMD_REQUIRED);
      if (cmd !== 1 && cmd !== 2) throw new BadRequestException(INVALID_SCHEDULE_CMD);

      const existed = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, [
        "id", "motor_id", "schedule_status", "start_time", "end_time", "schedule_start_date", "schedule_end_date", "repeat", "days_of_week", "starter_id"
      ]) as Pick<MotorSchedule, "id" | "motor_id" | "schedule_status" | "start_time" | "end_time" | "schedule_start_date" | "schedule_end_date" | "repeat" | "days_of_week" | "starter_id"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      let pcbForStatusLog: string | null = null;
      if (existed.starter_id) {
        const starterForLog = await getRecordById(starterBoxes, existed.starter_id, ["pcb_number"]) as { pcb_number: string | null } | null;
        pcbForStatusLog = starterForLog?.pcb_number ?? null;
      }
      const statusLogOldData: Record<string, unknown> = {
        ...(pcbForStatusLog && { pcb_number: pcbForStatusLog }),
        ...(formatScheduleDateTime(existed.schedule_start_date, existed.start_time) && { start_datetime: formatScheduleDateTime(existed.schedule_start_date, existed.start_time) }),
      };

      if (cmd === 1) {
        await stopScheduleById(scheduleId);
        await Promise.all([
          insertScheduleOperation({ schedule_id: scheduleId, operation: "STOP", sent_at: new Date() }).catch(() => null),
          insertScheduleLog({ schedule_id: scheduleId, event_type: "STOP_SENT", actor_type: "user", actor_id: userPayload.id, old_status: existed.schedule_status, new_status: "STOPPED" }).catch(() => null),
        ]);
        await ActivityService.logActivity({
          performedBy: userPayload.id,
          action: "SCHEDULE_STOPPED",
          entityType: "SCHEDULE",
          entityId: scheduleId,
          oldData: statusLogOldData,
        });
        return sendResponse(c, 200, SCHEDULE_STOPPED);
      }

      const conflicts = await findConflictingSchedules(existed.motor_id, existed.schedule_start_date, existed.schedule_end_date, existed.days_of_week ?? [], scheduleId);
      checkMotorScheduleConflict(existed, conflicts);

      await restartScheduleById(scheduleId);
      await Promise.all([
        insertScheduleOperation({ schedule_id: scheduleId, operation: "RESTART", sent_at: new Date() }).catch(() => null),
        insertScheduleLog({ schedule_id: scheduleId, event_type: "RESTART_SENT", actor_type: "user", actor_id: userPayload.id, old_status: "STOPPED", new_status: "SCHEDULED" }).catch(() => null),
      ]);
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULE_RESTARTED",
        entityType: "SCHEDULE",
        entityId: scheduleId,
        oldData: statusLogOldData,
      });
      return sendResponse(c, 200, SCHEDULE_RESTARTED);
    } catch (error: any) {
      handleAppError(error, "update schedule status");
    }
  };

  // =================== STOP ALL SCHEDULES ===================
  stopAllMotorSchedulesHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +(c.req.param("motor_id") ?? 0);
      paramsValidateException.validateId(motorId, "motor id");

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], ["id"]);
      if (!motor) throw new BadRequestException(MOTOR_NOT_FOUND);

      const active = await findAllActiveSchedulesForMotor(motor.id);
      if (!active || active.length === 0) throw new BadRequestException(NO_ACTIVE_SCHEDULE);

      const ids = active.map(s => s.id);
      await cancelSchedulesByIds(ids);
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "ALL_SCHEDULES_STOPPED",
        entityType: "SCHEDULE",
        entityId: motorId,
        newData: { cancelled_count: ids.length },
      });
      return sendResponse(c, 200, ALL_SCHEDULES_STOPPED, { cancelled_count: ids.length });
    } catch (error: any) {
      handleAppError(error, "stop all motor Schedules");
    }
  };

  // =================== ADD REPEAT DAYS ===================
  addRepeatDaysHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const reqData = await c.req.json();
      const data = await validatedRequest<ValidatedAddRepeatDays>("add-repeat-days", normalizeRepeatDaysPayload(reqData), ADD_REPEAT_DAYS_VALIDATION_CRITERIA);

      const existed = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, ["id", "motor_id", "days_of_week", "start_time", "end_time"]) as Pick<MotorSchedule, "id" | "motor_id" | "days_of_week" | "start_time" | "end_time"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      const mergedDays = [...new Set([...(existed.days_of_week || []), ...data.days_of_week])].sort();
      const conflicts = await findConflictingSchedules(existed.motor_id, null, null, mergedDays, scheduleId);
      checkMotorScheduleConflict({ start_time: existed.start_time, end_time: existed.end_time, repeat: 1, days_of_week: mergedDays }, conflicts);

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, { days_of_week: mergedDays, bit_wise_days: data.bit_wise_days ?? 0 });
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULE_REPEAT_DAYS_ADDED",
        entityType: "SCHEDULE",
        entityId: scheduleId,
        oldData: { days_of_week: existed.days_of_week },
        newData: { days_of_week: mergedDays },
      });
      return sendResponse(c, 200, REPEAT_DAYS_ADDED, { days_of_week: mergedDays });
    } catch (error: any) {
      handleAppError(error, "add repeat days");
    }
  };

  // =================== UPDATE ACKNOWLEDGEMENT (single) ===================
  updateAcknowledgementHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const existed = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, ["id", "schedule_status", "schedule_id", "starter_id"]) as Pick<MotorSchedule, "id" | "schedule_status" | "schedule_id" | "starter_id"> | null;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, { acknowledgement: 1, acknowledged_at: new Date(), schedule_status: "SCHEDULED" });

      // Set device_schedule_id = schedule_id when null (schedule_id holds the device slot for
      // records where device_schedule_id was never explicitly assigned).
      await db.update(motorSchedules)
        .set({ device_schedule_id: sql`COALESCE(${motorSchedules.device_schedule_id}, ${motorSchedules.schedule_id})` })
        .where(and(eq(motorSchedules.id, existed.id), isNull(motorSchedules.device_schedule_id)))
        .catch(() => null);

      await Promise.all([
        updateOperationAck(scheduleId, "CREATE", 1).catch(() => null),
        insertScheduleLog({ schedule_id: scheduleId, event_type: "DEVICE_ACK_CREATE", actor_type: "device", old_status: existed.schedule_status, new_status: "SCHEDULED" }).catch(() => null),
      ]);
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULE_ACKNOWLEDGED",
        entityType: "SCHEDULE",
        entityId: scheduleId,
      });
      return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED);
    } catch (error: any) {
      handleAppError(error, "update acknowledgement");
    }
  };

  // =================== BULK UPDATE ACKNOWLEDGEMENT ===================
  bulkUpdateAcknowledgementHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const data = await c.req.json();
      const scheduleIds: number[] = data.schedule_ids;
      // slot_map: record.id (string key) → device_schedule_id assigned by frontend
      const slotMap: Record<string, number> | undefined = data.slot_map;

      if (!scheduleIds || !Array.isArray(scheduleIds) || scheduleIds.length === 0) {
        throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);
      }

      // Fetch starter_id so we can update last_device_schedule_id
      const rows = await db.query.motorSchedules.findMany({
        where: inArray(motorSchedules.id, scheduleIds),
        columns: { id: true, schedule_id: true, starter_id: true },
      });

      await db.update(motorSchedules)
        .set({ acknowledgement: 1, acknowledged_at: new Date(), schedule_status: "SCHEDULED" })
        .where(inArray(motorSchedules.id, scheduleIds));

      if (slotMap && Object.keys(slotMap).length > 0) {
        // Frontend provided exact device slot IDs — use them directly.
        await Promise.all(
          scheduleIds.map(id => {
            const deviceId = slotMap[String(id)];
            if (deviceId == null) return Promise.resolve();
            return db.update(motorSchedules)
              .set({ device_schedule_id: deviceId })
              .where(eq(motorSchedules.id, id));
          })
        );
        // Update last_device_schedule_id to max slot used, grouped by starter.
        const byStarter = new Map<number, number[]>();
        for (const row of rows) {
          if (!row.starter_id) continue;
          const deviceId = slotMap[String(row.id)];
          if (deviceId == null) continue;
          const list = byStarter.get(row.starter_id) ?? [];
          list.push(deviceId);
          byStarter.set(row.starter_id, list);
        }
        for (const [starterId, deviceIds] of byStarter) {
          const maxId = Math.max(...deviceIds);
          await db.update(starterBoxes)
            .set({ last_device_schedule_id: sql`GREATEST(last_device_schedule_id, ${maxId})` })
            .where(eq(starterBoxes.id, starterId));
        }
      } else {
        // Fallback: assign device_schedule_id via last+1 increment (legacy / no slot_map provided).
        const byStarter = new Map<number, { id: number; schedule_id: number }[]>();
        for (const row of rows) {
          if (!row.starter_id) continue;
          const list = byStarter.get(row.starter_id) ?? [];
          list.push({ id: row.id, schedule_id: row.schedule_id });
          byStarter.set(row.starter_id, list);
        }
        for (const [starterId, records] of byStarter) {
          await assignDeviceScheduleIds(starterId, records);
        }
      }

      await Promise.all(
        scheduleIds.flatMap(id => [
          updateOperationAck(id, "CREATE", 1).catch(() => null),
          insertScheduleLog({ schedule_id: id, event_type: "DEVICE_ACK_CREATE", actor_type: "device", new_status: "SCHEDULED" }).catch(() => null),
        ])
      );
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULES_BULK_ACKNOWLEDGED",
        entityType: "SCHEDULE",
        newData: { schedule_ids: scheduleIds, count: scheduleIds.length },
      });
      return sendResponse(c, 200, ACKNOWLEDGEMENT_UPDATED);
    } catch (error: any) {
      handleAppError(error, "bulk update acknowledgement");
    }
  };

  // =================== SCHEDULE HISTORY ===================
  getScheduleHistoryHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const filters = buildScheduleHistoryFilters(query);
      const pageParams = getPaginationOffParams(query);

      const result = await findScheduleHistoryByMotorAndStarter(filters, pageParams);
      const records = result.records.map((record) => buildScheduleTimeline(record));

      return sendResponse(c, 200, SCHEDULE_HISTORY_FETCHED, {
        pagination: result.pagination,
        records,
      });
    } catch (error: any) {
      handleAppError(error, "get schedule history");
    }
  };

  // =================== BULK STOP SCHEDULES ===================
  bulkStopSchedulesHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const { ids }: { ids: number[] } = await c.req.json();
      if (!ids || !Array.isArray(ids) || ids.length === 0) throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);

      await cancelSchedulesByIds(ids);
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULES_BULK_STOPPED",
        entityType: "SCHEDULE",
        newData: { ids, count: ids.length },
      });
      return sendResponse(c, 200, BULK_SCHEDULES_STOPPED, { stopped_count: ids.length });
    } catch (error: any) {
      handleAppError(error, "bulk stop schedules");
      throw error;
    }
  };

  // =================== BULK RESTART SCHEDULES ===================
  bulkRestartSchedulesHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const { ids }: { ids: number[] } = await c.req.json();
      if (!ids || !Array.isArray(ids) || ids.length === 0) throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);

      const schedules = await db.query.motorSchedules.findMany({
        where: inArray(motorSchedules.id, ids),
        columns: { id: true, motor_id: true, schedule_status: true, start_time: true, end_time: true, schedule_start_date: true, schedule_end_date: true, repeat: true, days_of_week: true },
      });

      for (const schedule of schedules) {
        const conflicts = await findConflictingSchedules(schedule.motor_id, schedule.schedule_start_date, schedule.schedule_end_date, schedule.days_of_week ?? [], ids);
        checkMotorScheduleConflict(schedule, conflicts);
      }

      await restartSchedulesByIds(ids);
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULES_BULK_RESTARTED",
        entityType: "SCHEDULE",
        newData: { ids, count: ids.length },
      });
      return sendResponse(c, 200, BULK_SCHEDULES_RESTARTED, { restarted_count: ids.length });
    } catch (error: any) {
      handleAppError(error, "bulk restart schedules");
      throw error;
    }
  };

  // =================== BULK DELETE SCHEDULES ===================
  bulkDeleteSchedulesHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const { ids }: { ids: number[] } = await c.req.json();
      if (!ids || !Array.isArray(ids) || ids.length === 0) throw new BadRequestException(BULK_SCHEDULE_IDS_REQUIRED);

      const toDelete = await db.query.motorSchedules.findMany({
        where: inArray(motorSchedules.id, ids),
        columns: { starter_id: true },
      });

      await db.update(motorSchedules)
        .set({ schedule_status: "DELETED", deleted_by: userPayload.id, deleted_at: new Date(), status: "ARCHIVED", enabled: false, updated_at: new Date() })
        .where(inArray(motorSchedules.id, ids));

      const starterIds = [...new Set(toDelete.map(r => r.starter_id).filter((id): id is number => id != null))];
      for (const sid of starterIds) {
        syncLastDeviceScheduleId(sid).catch(() => null);
      }

      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULES_BULK_DELETED",
        entityType: "SCHEDULE",
        newData: { ids, count: ids.length },
      });
      return sendResponse(c, 200, BULK_SCHEDULES_DELETED, { deleted_count: ids.length });
    } catch (error: any) {
      handleAppError(error, "bulk delete schedules");
      throw error;
    }
  };

  // =================== SYNC STATUSES ===================
  syncScheduleStatusesHandler = async (c: Context) => {
    try {
      const now = new Date();
      const schedules = await findEvaluatableSchedules();
      if (!schedules || schedules.length === 0) return sendResponse(c, 200, SCHEDULE_STATUS_SYNC_COMPLETED, { evaluated: 0, updated: 0, transitions: [] });

      const transitions: any[] = [];
      const groups = {
        SCHEDULED: [] as number[],
        RUNNING: [] as number[],
        COMPLETED: [] as number[],
        PARTIAL: [] as number[],
        MISSED: [] as number[],
        WAITING_NEXT_CYCLE: [] as number[],
      };

      for (const s of schedules) {
        const res = evaluateScheduleStatus(s as ScheduleForEvaluation, now);
        if (!res) continue;
        const key = res.newStatus as keyof typeof groups;
        if (groups[key]) groups[key].push(res.id);
        transitions.push({ schedule_id: res.id, from: s.schedule_status, to: res.newStatus });
      }

      await batchUpdateScheduleStatuses([
        { status: "SCHEDULED", ids: groups.SCHEDULED },
        { status: "RUNNING", ids: groups.RUNNING, last_started_at: now },
        { status: "COMPLETED", ids: groups.COMPLETED, last_stopped_at: now, completed_at: now },
        { status: "PARTIAL", ids: groups.PARTIAL, last_stopped_at: now },
        { status: "MISSED", ids: groups.MISSED, last_stopped_at: now },
        { status: "WAITING_NEXT_CYCLE", ids: groups.WAITING_NEXT_CYCLE, last_stopped_at: now },
      ]);

      await Promise.all(
        transitions.map(t =>
          insertScheduleLog({ schedule_id: t.schedule_id, event_type: "STATUS_CHANGED", actor_type: "system", old_status: t.from, new_status: t.to }).catch(() => null)
        )
      );

      return sendResponse(c, 200, SCHEDULE_STATUS_SYNC_COMPLETED, { evaluated: schedules.length, updated: transitions.length, transitions });
    } catch (error: any) {
      handleAppError(error, "sync schedule statuses");
    }
  };

  // =================== PER-DAY BITMASK UPDATE ===================
  updateDayBitmaskHandler = async (c: Context) => {
    try {
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const { action, day } = await c.req.json();

      if (!["stop", "restart", "delete"].includes(action))
        throw new BadRequestException("action must be stop | restart | delete");
      if (!Number.isInteger(day) || day < 0 || day > 6)
        throw new BadRequestException("day must be an integer 0–6 (0=Sun … 6=Sat)");

      const existed = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, ["id", "days_of_week", "bit_wise_days", "schedule_status"]) as any;
      if (!existed) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      if (action === "stop") {
        await stopDayInSchedule(scheduleId, day);
        return sendResponse(c, 200, "Day stopped");
      }

      if (action === "restart") {
        if (!existed.days_of_week?.includes(day))
          throw new BadRequestException("Cannot restart a day that was permanently deleted");
        await restartDayInSchedule(scheduleId, day);
        return sendResponse(c, 200, "Day restarted");
      }

      const remainingDays = (existed.days_of_week ?? []).filter((d: number) => d !== day);
      await deleteDayFromSchedule(scheduleId, day);

      if (remainingDays.length === 0) {
        await updateRecordById<MotorScheduleTable>(motorSchedules, scheduleId, {
          schedule_status: "DELETED", enabled: false,
        });
        return sendResponse(c, 200, "Day deleted — schedule removed (no days remaining)");
      }

      return sendResponse(c, 200, "Day deleted");
    } catch (error: any) {
      handleAppError(error, "update day bitmask");
    }
  };

  // =================== PENDING FOR SYNC ===================
  getPendingSchedulesForSyncHandler = async (c: Context) => {
    try {
      const today = todayAsYYMMDD();
      const allRecords = await findPendingSchedulesForSync();
      if (!allRecords || allRecords.length === 0) return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, []);

      // Per-starter anchor check: only send next batch after the device's last
      // acknowledged end date has passed. While today <= max_acked_end_date the
      // device still has active schedules; withhold the next batch until they expire.
      const anchorMap = await findMaxAckedEndDatePerStarter(today);

      const starterGroups = new Map<number, typeof allRecords>();
      for (const r of allRecords) {
        if (!r.starter_id) continue;
        const list = starterGroups.get(r.starter_id) ?? [];
        list.push(r);
        starterGroups.set(r.starter_id, list);
      }

      const records: typeof allRecords = [];
      for (const [starterId, stRecords] of starterGroups) {
        const maxEndDate = anchorMap.get(starterId);
        if (maxEndDate != null && today <= maxEndDate) continue; // device still has schedules
        // Apply today → today+2 window for this starter
        const twoDaysLater = new Date();
        twoDaysLater.setDate(twoDaysLater.getDate() + 2);
        const windowEnd = dateToYYMMDD(twoDaysLater);
        records.push(...stRecords.filter(r => r.schedule_start_date != null && r.schedule_start_date <= windowEnd));
      }

      if (records.length === 0) return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, []);

      // Delete expired schedules per starter and assign sequential device_schedule_ids from 1.
      const starterIds = [...new Set(records.map(r => r.starter_id).filter((id): id is number => id != null))];
      for (const starterId of starterIds) {
        const freed = await findAndDeleteExpiredSchedules(starterId);
        if (freed.length > 0) {
          logger.info(`[sync/pending] starter=${starterId} cleared ${freed.length} expired schedule(s)`);
        }
        const starterRecords = records.filter(r => r.starter_id === starterId);
        await Promise.all(starterRecords.map((r, i) => {
          (r as any).device_schedule_id = i + 1;
          return db.update(motorSchedules)
            .set({ device_schedule_id: i + 1 })
            .where(eq(motorSchedules.id, r.id))
            .catch(() => null);
        }));
        logger.info(`[sync/pending] starter=${starterId} assigned device_schedule_ids=[${starterRecords.map((_, i) => i + 1).join(",")}]`);
      }

      const ackedRows = starterIds.length > 0
        ? await db.selectDistinct({ starter_id: motorSchedules.starter_id })
            .from(motorSchedules)
            .where(and(
              inArray(motorSchedules.starter_id, starterIds),
              eq(motorSchedules.acknowledgement, 1),
              ne(motorSchedules.status, "ARCHIVED"),
            ))
        : []
      const ackedStarterSet = new Set(ackedRows.map(r => r.starter_id).filter((id): id is number => id != null))
      const firstSyncStarterIds = new Set(starterIds.filter(id => !ackedStarterSet.has(id)))

      const grouped = buildDeviceSyncPayloads(records, firstSyncStarterIds);
      const starters = await db.select().from(starterBoxes).where(inArray(starterBoxes.id, grouped.map(g => g.starter_id)));
      const starterMap = new Map(starters.map(s => [s.id, s]));

      const isOnline = (sq: number | null | undefined) => sq != null && sq >= 1 && sq <= 30;

      let totalDevices = 0, totalChunks = 0, skippedOffline = 0;
      for (const { starter_id, chunks } of grouped) {
        const starter = starterMap.get(starter_id);
        if (!starter) continue;

        if (!isOnline(starter.signal_quality)) {
          skippedOffline++;
          continue;
        }

        totalDevices++;
        const publishKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
        for (const { payload, dbIds, scheduleIds } of chunks) {
          totalChunks++;

          // Re-verify these records are still PENDING before publishing.
          // A concurrent heartbeat or prior sync call may have already delivered them.
          const stillPending = await db.query.motorSchedules.findMany({
            where: (ms, { and: a, inArray: inArr, eq: e }) =>
              a(inArr(ms.id, dbIds), e(ms.acknowledgement, 0)),
            columns: { id: true, schedule_id: true },
          });
          if (stillPending.length === 0) continue;
          const stillPendingIds = new Set(stillPending.map(r => r.id));
          const verifiedDbIds = dbIds.filter(id => stillPendingIds.has(id));
          const verifiedScheduleIds = scheduleIds.filter((_, i) => stillPendingIds.has(dbIds[i]));

          if (await publishMultipleTimesInBackground(payload, starter)) {
            // Read partial ACK bitmask — device may have confirmed only a subset of schedule_ids.
            const partialIds = publishKey ? schedulePartialAckMap.get(publishKey) : undefined;
            if (publishKey) schedulePartialAckMap.delete(publishKey);

            // Build (dbId, schedule_id) pairs from verified-still-PENDING records only.
            const allPairs = verifiedDbIds.map((id, i) => ({ id, schedule_id: verifiedScheduleIds[i] }));
            const confirmedPairs = partialIds && partialIds.length > 0
              ? (() => {
                  const confirmedSet = new Set(partialIds);
                  const matched = allPairs.filter(p => confirmedSet.has(p.schedule_id));
                  const unmatched = scheduleIds.filter(sid => !confirmedSet.has(sid));
                  if (unmatched.length > 0) {
                    console.warn(`[schedule-sync] starter=${starter_id} partial ACK: confirmed=[${partialIds.join(",")}] unmatched=[${unmatched.join(",")}] — unmatched stay PENDING`);
                  }
                  return matched;
                })()
              : allPairs;

            if (confirmedPairs.length === 0) continue;
            const confirmedDbIds = confirmedPairs.map(p => p.id);

            await db.update(motorSchedules).set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() }).where(inArray(motorSchedules.id, confirmedDbIds));
            // Set device_schedule_id directly from the confirmed slot IDs (scheduleIds[i] is the
            // device slot that was sent). Only update rows where device_schedule_id is not yet set.
            await Promise.all(confirmedPairs.map(p =>
              db.update(motorSchedules)
                .set({ device_schedule_id: p.schedule_id })
                .where(and(eq(motorSchedules.id, p.id), isNull(motorSchedules.device_schedule_id)))
                .catch(() => null)
            ));

            await Promise.all(
              confirmedDbIds.flatMap(id => [
                insertScheduleOperation({ schedule_id: id, operation: "CREATE", sent_at: new Date() }).catch(() => null),
                insertScheduleLog({ schedule_id: id, event_type: "SENT_TO_DEVICE", actor_type: "system", new_status: "SCHEDULED" }).catch(() => null),
              ])
            );
          } else {
            // Publish failed — clear any stale partial ACK entry that may have arrived.
            if (publishKey) schedulePartialAckMap.delete(publishKey);
          }
        }
      }
      return sendResponse(c, 200, PENDING_SCHEDULES_FETCHED, { devices: totalDevices, total_chunks: totalChunks, skipped_offline: skippedOffline });
    } catch (error: any) {
      handleAppError(error, "get pending schedules for sync");
    }
  };

  // =================== REPUBLISH STUCK PENDING SCHEDULES ===================
  republishSchedulesHandler = async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const starterId = Number(body?.starter_id);
      const motorId = body?.motor_id != null ? Number(body.motor_id) : undefined;

      if (!starterId || isNaN(starterId)) throw new BadRequestException("starter_id is required");

      const starter = await db.query.starterBoxes.findFirst({
        where: (s, { eq: e }) => e(s.id, starterId),
      });
      if (!starter) throw new BadRequestException("Starter not found");

      const isOnline = starter.signal_quality != null && starter.signal_quality >= 1 && starter.signal_quality <= 30;
      if (!isOnline) {
        return sendResponse(c, 200, "Device is offline — schedules remain PENDING and will be delivered on next heartbeat", { published: 0, failed: 0, pending: 0 });
      }

      const records = await findPendingSchedulesForRepublish(starterId, motorId);
      if (!records || records.length === 0) {
        return sendResponse(c, 200, "No PENDING schedules found for this starter", { published: 0, failed: 0, pending: 0 });
      }

      const publishKey = starter.device_allocation === "false" ? starter.mac_address : starter.pcb_number;
      const ackedRow = await db.query.motorSchedules.findFirst({
        where: (ms, { and: a, eq: e, ne: n }) => a(
          e(ms.starter_id, starterId),
          e(ms.acknowledgement, 1),
          n(ms.status, "ARCHIVED"),
        ),
        columns: { id: true },
      })
      const firstSyncStarterIds = ackedRow ? new Set<number>() : new Set([starterId])
      const grouped = buildDeviceSyncPayloads(records, firstSyncStarterIds);

      let published = 0, failed = 0;

      for (const { chunks } of grouped) {
        for (const { payload, dbIds, scheduleIds } of chunks) {
          // Re-verify still PENDING before publishing
          const stillPending = await db.query.motorSchedules.findMany({
            where: (ms, { and: a, inArray: inArr, eq: e }) =>
              a(inArr(ms.id, dbIds), e(ms.acknowledgement, 0)),
            columns: { id: true, schedule_id: true },
          });
          if (stillPending.length === 0) continue;
          const stillPendingIds = new Set(stillPending.map(r => r.id));
          const verifiedDbIds = dbIds.filter(id => stillPendingIds.has(id));
          const verifiedScheduleIds = scheduleIds.filter((_, i) => stillPendingIds.has(dbIds[i]));

          const ok = await publishMultipleTimesInBackground(payload, starter);
          if (ok) {
            published++;
            const partialIds = publishKey ? schedulePartialAckMap.get(publishKey) : undefined;
            if (publishKey) schedulePartialAckMap.delete(publishKey);

            const allPairs = verifiedDbIds.map((id, i) => ({ id, schedule_id: verifiedScheduleIds[i] }));
            const confirmedPairs = partialIds && partialIds.length > 0
              ? (() => {
                  const confirmedSet = new Set(partialIds);
                  const matched = allPairs.filter(p => confirmedSet.has(p.schedule_id));
                  const unmatched = verifiedScheduleIds.filter(sid => !confirmedSet.has(sid));
                  if (unmatched.length > 0) {
                    logger.warn(`[republish] starter=${starterId} partial ACK: confirmed=[${partialIds.join(",")}] unmatched=[${unmatched.join(",")}] — unmatched stay PENDING`);
                  }
                  return matched;
                })()
              : allPairs;

            if (confirmedPairs.length === 0) continue;
            const confirmedDbIds = confirmedPairs.map(p => p.id);

            await db.update(motorSchedules)
              .set({ schedule_status: "SCHEDULED", acknowledgement: 1, acknowledged_at: new Date(), updated_at: new Date() })
              .where(inArray(motorSchedules.id, confirmedDbIds));

            await Promise.all(confirmedPairs.map(p =>
              db.update(motorSchedules)
                .set({ device_schedule_id: p.schedule_id })
                .where(and(eq(motorSchedules.id, p.id), isNull(motorSchedules.device_schedule_id)))
                .catch(() => null)
            ));

            await Promise.all(
              confirmedDbIds.flatMap(id => [
                insertScheduleOperation({ schedule_id: id, operation: "CREATE", sent_at: new Date() }).catch(() => null),
                insertScheduleLog({ schedule_id: id, event_type: "SENT_TO_DEVICE", actor_type: "system", new_status: "SCHEDULED" }).catch(() => null),
              ])
            );
          } else {
            failed++;
            if (publishKey) schedulePartialAckMap.delete(publishKey);
            logger.warn(`[republish] starter=${starterId} chunk publish failed — stays PENDING for heartbeat retry`);
          }
        }
      }

      return sendResponse(c, 200, "Republish complete", { published, failed, pending: failed });
    } catch (error: any) {
      handleAppError(error, "republish schedules");
    }
  };

  // =================== SINGLE SCHEDULE HISTORY (timeline) ===================
  getScheduleHistoryByIdHandler = async (c: Context) => {
    try {
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const schedule = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId);
      if (!schedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      return sendResponse(c, 200, SCHEDULE_HISTORY_FETCHED, buildScheduleTimeline(schedule));
    } catch (error: any) {
      handleAppError(error, "get schedule history by id");
    }
  };

  // =================== SCHEDULE LOGS ===================
  getScheduleLogsHandler = async (c: Context) => {
    try {
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const query = c.req.query();
      const page = +(query.page) || 1;
      const limit = +(query.limit) || 20;

      const schedule = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, ["id"]);
      if (!schedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      const result = await findScheduleLogsByScheduleId(scheduleId, page, limit);
      return sendResponse(c, 200, SCHEDULE_LOGS_FETCHED, result);
    } catch (error: any) {
      handleAppError(error, "get schedule logs");
    }
  };

  // =================== SCHEDULE LIVE DATA ===================
  getScheduleLiveDataHandler = async (c: Context) => {
    try {
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const schedule = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, ["id"]);
      if (!schedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      const liveData = await findScheduleLiveData(scheduleId);
      if (!liveData) throw new BadRequestException(SCHEDULE_LIVE_DATA_NOT_FOUND);

      return sendResponse(c, 200, SCHEDULE_LIVE_DATA_FETCHED, liveData);
    } catch (error: any) {
      handleAppError(error, "get schedule live data");
    }
  };

  // =================== SCHEDULE OPERATIONS ===================
  getScheduleOperationsHandler = async (c: Context) => {
    try {
      const scheduleId = +(c.req.param("id") ?? 0);
      paramsValidateException.validateId(scheduleId, "schedule id");

      const schedule = await getRecordById<MotorScheduleTable>(motorSchedules, scheduleId, ["id"]);
      if (!schedule) throw new BadRequestException(SCHEDULE_NOT_FOUND);

      const operations = await findOperationsByScheduleId(scheduleId);
      return sendResponse(c, 200, SCHEDULE_OPERATIONS_FETCHED, operations);
    } catch (error: any) {
      handleAppError(error, "get schedule operations");
    }
  };

  // =================== BULK REPUBLISH SCHEDULES ===================
  // Body: { starter_id: number, ids?: number[] }
  // - If ids provided: reset FAILED records in that list back to PENDING, then sync
  // - If ids omitted: sync all pending for the starter (same as heartbeat trigger)
  bulkRepublishSchedulesHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const body = await c.req.json();
      const starterId = Number(body?.starter_id);
      const ids: number[] | undefined = Array.isArray(body?.ids) && body.ids.length > 0 ? body.ids.map(Number) : undefined;

      if (!starterId || isNaN(starterId)) throw new BadRequestException("starter_id is required");

      const starter = await db.query.starterBoxes.findFirst({
        where: (s, { eq: e }) => e(s.id, starterId),
      });
      if (!starter) throw new BadRequestException("Starter not found");

      const isOnline = starter.signal_quality != null && starter.signal_quality >= 1 && starter.signal_quality <= 30;
      if (!isOnline) {
        return sendResponse(c, 200, SCHEDULE_DEVICE_OFFLINE, { chunks: 0, acked: 0 });
      }

      // Reset FAILED/PENDING records in the given id list so the sync picks them up fresh.
      if (ids && ids.length > 0) {
        await db.update(motorSchedules)
          .set({ schedule_status: "PENDING", acknowledgement: 0, updated_at: new Date() })
          .where(and(
            inArray(motorSchedules.id, ids),
            eq(motorSchedules.starter_id, starterId),
            inArray(motorSchedules.schedule_status, ["FAILED", "PENDING"]),
            ne(motorSchedules.status, "ARCHIVED"),
          ));
      }

      const result = await pushPendingSchedulesForStarter(starter as any, undefined, ids);

      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SCHEDULES_BULK_RESENT",
        entityType: "SCHEDULE",
        newData: { starter_id: starterId, ids: ids ?? "all", ...result },
      });

      return sendResponse(c, 200, SCHEDULE_REPUBLISHED, result);
    } catch (error: any) {
      handleAppError(error, "bulk republish schedules");
    }
  };
}
