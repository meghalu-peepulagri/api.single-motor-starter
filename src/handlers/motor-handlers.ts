import { and, eq, ne } from "drizzle-orm";
import type { Context } from "hono";
import { MOTOR_ADDED, MOTOR_DELETED, MOTOR_DETAILS_FETCHED, MOTOR_NAME_EXISTED, MOTOR_NOT_FOUND, MOTOR_TEST_RUN_STATUS_UPDATED, MOTOR_UPDATED, MOTOR_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { motors, type MotorsTable, type NewMotor } from "../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { motorFilters } from "../helpers/motor-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getMotorsLatestRuntime, getMotorsTotalRunOnTime, paginatedMotorsList } from "../services/db/motor-services.js";
import { getMotorWithStarterDetails } from "../services/db/motor-starter-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddMotor, validatedAssignMotor, validatedReplaceMotor, validatedUpdateMotor, validatedUpdateMotorTestRunStatus } from "../validations/schema/motor-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import { ActivityService } from "../services/db/activity-service.js";
import { prepareMotorStateControlNotificationData, prepareMotorModeControlNotificationData } from "../helpers/motor-helper.js";
import { sendUserNotification } from "../services/fcm/fcm-service.js";

const paramsValidateException = new ParamsValidateException();

export class MotorHandlers {

  addMotorHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(motorPayload);
      const validMotorReq = await validatedRequest<validatedAddMotor>("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);

      if (validMotorReq.starter_id && validMotorReq.motor_reference) {
        const slotTaken = await db.query.motors.findFirst({
          where: and(
            eq(motors.starter_id, validMotorReq.starter_id),
            eq(motors.motor_reference, validMotorReq.motor_reference),
            ne(motors.status, "ARCHIVED")
          )
        });
        if (slotTaken) throw new ConflictException("Motor slot already occupied");
      }

      const preparedMotorPayload: NewMotor = {
        name: validMotorReq.name,
        alias_name: validMotorReq.name,
        created_by: userPayload.id,
        location_id: validMotorReq.location_id,
        hp: validMotorReq.hp.toString(),
        starter_id: validMotorReq.starter_id ?? undefined,
        motor_reference: validMotorReq.motor_reference ?? undefined,
      }

      await db.transaction(async (trx) => {
        const motor = await saveSingleRecord<MotorsTable>(motors, preparedMotorPayload, trx);

        if (motor) {
          await ActivityService.writeMotorAddedLog(userPayload.id, motor.id, {
            name: motor.alias_name,
            hp: motor.hp,
            location_id: motor.location_id
          }, trx);
        }
      });

      return sendResponse(c, 201, MOTOR_ADDED);
    } catch (error: any) {
      console.error("Error at add motor :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at add motor :", error);
      throw error;
    }
  };

  updateMotorHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +c.req.param("id")!;
      const motorPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(motorPayload);
      const validMotorReq = await validatedRequest<validatedUpdateMotor>("update-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      const existedMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["location_id", "alias_name", "id", "status"], ["=", "=", "!=", "!="], [motor.location_id, validMotorReq.name, motor.id, "ARCHIVED"]);
      if (existedMotor) throw new ConflictException(MOTOR_NAME_EXISTED);

      const device = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [motor.starter_id, "ARCHIVED"]);
      const notificationData = await db.transaction(async (trx) => {
        const updatePayload: any = { alias_name: validMotorReq.name, hp: validMotorReq.hp.toString() };
        if (validMotorReq.state !== undefined) updatePayload.state = validMotorReq.state;
        if (validMotorReq.mode !== undefined) updatePayload.mode = validMotorReq.mode;

        const updatedMotor = await updateRecordById(motors, motorId, updatePayload, trx);
        await ActivityService.writeMotorUpdatedLog(userPayload.id, motorId,
          { name: motor.alias_name, hp: motor.hp, state: motor.state, mode: motor.mode },
          { name: updatedMotor.alias_name, hp: updatedMotor.hp, state: updatedMotor.state, mode: updatedMotor.mode },
          trx,
          motor.starter_id || undefined
        );

        const starterId = motor.starter_id || 0;
        const hasStateChanged = updatedMotor.state !== undefined && updatedMotor.state !== motor.state;
        const hasModeChanged = updatedMotor.mode !== undefined && updatedMotor.mode !== motor.mode;
        const mode = updatedMotor.mode || motor.mode || "";
        const starterNumber = device ? device.starter_number : "";

        const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, updatedMotor.state, mode, starterId, starterNumber) : null;
        const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, updatedMotor.mode, starterId, starterNumber) : null;
        return { notificationDataState, notificationDataMode };
      })

      if (notificationData.notificationDataState) {
        await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
      }
      if (notificationData.notificationDataMode) {
        await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
      }

      return sendResponse(c, 200, MOTOR_UPDATED);
    } catch (error: any) {
      console.error("Error at update motor :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at update motor :", error);
      throw error;
    }
  };

  getSingleMotorHandler = async (c: Context) => {
    try {
      const motorId = +c.req.param("id")!;
      const query = c.req.query();
      paramsValidateException.validateId(motorId, "motor id");
      const defaultColumns = ["id", "name", "hp", "status", "state", "mode"];
      let motorColumns = defaultColumns;

      if (query.columns) {
        const extraColumns = query.columns.split(",");
        motorColumns = getTableColumnsWithDefaults(motors, defaultColumns, extraColumns);
      }

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], [...motorColumns]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      const motorWithStarterDetails = await getMotorWithStarterDetails(motor.id);
      return sendResponse(c, 200, MOTOR_DETAILS_FETCHED, motorWithStarterDetails);
    } catch (error: any) {
      console.error("Error at get single motor :", error);
      throw error;
    }
  };

  deleteMotorHandler = async (c: Context) => {
    try {
      const motorId = +c.req.param("id")!;
      paramsValidateException.validateId(motorId, "motor id");
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      const userPayload = c.get("user_payload");
      await db.transaction(async trx => {
        await updateRecordById<MotorsTable>(motors, motor.id, { status: "ARCHIVED" }, trx);

        if (motor.starter_id) {
          const remaining = await trx
            .select({ id: motors.id })
            .from(motors)
            .where(and(
              eq(motors.starter_id, motor.starter_id),
              ne(motors.status, "ARCHIVED"),
              ne(motors.id, motor.id)
            ));

          if (remaining.length === 0) {
            await updateRecordById<StarterBoxTable>(starterBoxes, motor.starter_id, { device_status: "DEPLOYED", user_id: null }, trx);
          }
        }

        await trx.update(motorSchedules)
          .set({ status: "ARCHIVED" })
          .where(and(
            eq(motorSchedules.motor_id, motor.id),
            ne(motorSchedules.status, "ARCHIVED")
          ));

        await ActivityService.writeMotorDeletedLog(userPayload.id, motor.id, trx, motor.starter_id || undefined);
      });
      return sendResponse(c, 200, MOTOR_DELETED);
    } catch (error: any) {
      console.error("Error at delete motor :", error);
      throw error;
    }
  }

  assignMotorHandler = async (c: Context) => {
    try {
      const motorId = +c.req.param("id")!;
      paramsValidateException.validateId(motorId, "motor id");
      const payload = await c.req.json();
      paramsValidateException.emptyBodyValidation(payload);
      const userPayload = c.get("user_payload");
      const validPayload = await validatedRequest<validatedAssignMotor>("assign-motor", payload, MOTOR_VALIDATION_CRITERIA);

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      if (motor.starter_id !== null) {
        throw new ConflictException("Motor is already assigned to a device. Detach it first.");
      }

      const slotTaken = await db.query.motors.findFirst({
        where: and(
          eq(motors.starter_id, validPayload.starter_id),
          eq(motors.motor_reference, validPayload.motor_reference),
          ne(motors.status, "ARCHIVED")
        )
      });
      if (slotTaken) throw new ConflictException("Motor slot already occupied on target device");

      await db.transaction(async trx => {
        await updateRecordById<MotorsTable>(motors, motorId, {
          starter_id: validPayload.starter_id,
          motor_reference: validPayload.motor_reference,
          assigned_at: new Date(),
        }, trx);

        await ActivityService.writeMotorAssignedLog(userPayload.id, motorId, validPayload.starter_id, validPayload.motor_reference, trx);
      });

      return sendResponse(c, 200, "Motor assigned successfully");
    } catch (error: any) {
      console.error("Error at assign motor :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      throw error;
    }
  }

  detachMotorHandler = async (c: Context) => {
    try {
      const motorId = +c.req.param("id")!;
      paramsValidateException.validateId(motorId, "motor id");
      const userPayload = c.get("user_payload");

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      if (motor.starter_id === null) {
        throw new BadRequestException("Motor is not assigned to any device");
      }

      const starterId = motor.starter_id;

      await db.transaction(async trx => {
        await updateRecordById<MotorsTable>(motors, motorId, {
          starter_id: null,
          motor_reference: null,
        }, trx);

        const remaining = await trx
          .select({ id: motors.id })
          .from(motors)
          .where(and(
            eq(motors.starter_id, starterId),
            ne(motors.status, "ARCHIVED"),
            ne(motors.id, motorId)
          ));

        if (remaining.length === 0) {
          await updateRecordById<StarterBoxTable>(starterBoxes, starterId, { device_status: "DEPLOYED", user_id: null }, trx);
        }

        await ActivityService.writeMotorDetachedLog(userPayload.id, motorId, starterId, trx);
      });

      return sendResponse(c, 200, "Motor detached successfully");
    } catch (error: any) {
      console.error("Error at detach motor :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      throw error;
    }
  }

  replaceMotorHandler = async (c: Context) => {
    try {
      const motorId = +c.req.param("id")!;
      paramsValidateException.validateId(motorId, "motor id");
      const payload = await c.req.json();
      paramsValidateException.emptyBodyValidation(payload);
      const userPayload = c.get("user_payload");
      const validPayload = await validatedRequest<validatedReplaceMotor>("replace-motor", payload, MOTOR_VALIDATION_CRITERIA);

      const oldMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!oldMotor) throw new NotFoundException(MOTOR_NOT_FOUND);

      if (!oldMotor.starter_id || !oldMotor.motor_reference) {
        throw new BadRequestException("Motor is not assigned to any device slot");
      }

      await db.transaction(async trx => {
        await trx.update(motors)
          .set({ status: "ARCHIVED", updated_at: new Date() })
          .where(eq(motors.id, oldMotor.id));

        const newMotor = await saveSingleRecord<MotorsTable>(motors, {
          name: validPayload.name,
          alias_name: validPayload.name,
          hp: validPayload.hp.toString(),
          location_id: validPayload.location_id,
          starter_id: oldMotor.starter_id!,
          motor_reference: oldMotor.motor_reference!,
          created_by: userPayload.id,
          assigned_at: new Date(),
        }, trx);

        await ActivityService.writeMotorReplacedLog(
          userPayload.id,
          oldMotor.id,
          newMotor.id,
          oldMotor.starter_id!,
          oldMotor.motor_reference!,
          trx
        );
      });

      return sendResponse(c, 200, "Motor replaced successfully");
    } catch (error: any) {
      console.error("Error at replace motor :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  }


  getAllMotorsHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);
      const orderQueryData = parseOrderByQueryCondition<MotorsTable>(query.order_by, query.order_type, "assigned_at", "desc");
      const whereQueryData = motorFilters(query, userPayload);
      const motorsData = await paginatedMotorsList(whereQueryData, orderQueryData, paginationParams);

      const motorIds = motorsData.records.map((m: any) => m.id).filter(Boolean);

      const latestRuntimeMap = await getMotorsLatestRuntime(motorIds);

      const records = motorsData.records.map((motor: any) => ({
        ...motor,
        run_time: {
          last_state: latestRuntimeMap[motor.id]?.state,
          state_duration: latestRuntimeMap[motor.id]?.duration,
        },
      }));

      return sendResponse(c, 200, MOTOR_DETAILS_FETCHED, {
        ...motorsData,
        records,
      });
    } catch (error: any) {
      console.error("Error at get all motors :", error);
      throw error;
    }
  };

  updateMotorTestRunStatusHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +c.req.param("id")!;
      paramsValidateException.validateId(motorId, "motor id");

      const motorPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(motorPayload);

      const validMotorReq = await validatedRequest<validatedUpdateMotorTestRunStatus>("update-motor-test-run-status", motorPayload, MOTOR_VALIDATION_CRITERIA);

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      await db.transaction(async trx => {
        await updateRecordById<MotorsTable>(motors, motor.id, { test_run_status: validMotorReq.test_run_status, test_run_completed_at: new Date() }, trx);
        await ActivityService.writeMotorTestRunStatusUpdatedLog(
          userPayload.id,
          motor.id,
          motor.test_run_status,
          validMotorReq.test_run_status,
          trx,
          motor.starter_id || undefined
        );
      });

      return sendResponse(c, 200, MOTOR_TEST_RUN_STATUS_UPDATED);
    } catch (error: any) {
      console.error("Error at update motor test run status:", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  }
}