import type { Context } from "hono";
import { MOTOR_ADDED, MOTOR_ALREADY_ASSIGNED, MOTOR_ASSIGN_VALIDATION_CRITERIA, MOTOR_ASSIGNED_TO_DEVICE, MOTOR_DELETED, MOTOR_DETACHED_FROM_DEVICE, MOTOR_DETAILS_FETCHED, MOTOR_NAME_EXISTED, MOTOR_NOT_ASSIGNED_TO_DEVICE, MOTOR_NOT_FOUND, MOTOR_REPLACE_VALIDATION_CRITERIA, MOTOR_REPLACED_DEVICE, MOTOR_SAME_DEVICE, MOTOR_TEST_RUN_STATUS_UPDATED, MOTOR_UPDATED, MOTOR_VALIDATION_CRITERIA, STARTER_BOX_NOT_FOUND, STARTER_NOT_DEPLOYED } from "../constants/app-constants.js";
import db from "../database/configuration.js";
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
import { checkDeviceMotorCapacity, resolveMotorSlot } from "../helpers/motor-device-helper.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddMotor, validatedAssignMotorToDevice, validatedReplaceMotorDevice, validatedUpdateMotor, validatedUpdateMotorTestRunStatus } from "../validations/schema/motor-validations.js";
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

      const preparedMotorPayload: NewMotor = {
        name: validMotorReq.name,
        alias_name: validMotorReq.name,
        created_by: userPayload.id,
        location_id: validMotorReq.location_id,
        hp: validMotorReq.hp.toString(),
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
      const motorId = +c.req.param("id");
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
      const motorId = +c.req.param("id");
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
      const motorId = +c.req.param("id");
      paramsValidateException.validateId(motorId, "motor id");
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      const userPayload = c.get("user_payload");
      await db.transaction(async trx => {
        await updateRecordById<MotorsTable>(motors, motor.id, { status: "ARCHIVED" }, trx);
        if (motor.starter_id) {
          await updateRecordById<StarterBoxTable>(starterBoxes, motor.starter_id, { device_status: "DEPLOYED", user_id: null }, trx);
        }

        await ActivityService.writeMotorDeletedLog(userPayload.id, motor.id, trx, motor.starter_id || undefined);
      })
      return sendResponse(c, 200, MOTOR_DELETED);
    } catch (error: any) {
      console.error("Error at delete motor :", error);
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

  assignMotorToDeviceHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +c.req.param("id");
      paramsValidateException.validateId(motorId, "motor id");

      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignMotorToDevice>("assign-motor-to-device", reqData, MOTOR_ASSIGN_VALIDATION_CRITERIA);

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      if (motor.starter_id) throw new ConflictException(MOTOR_ALREADY_ASSIGNED);

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      if (starter.device_status !== "DEPLOYED") throw new BadRequestException(STARTER_NOT_DEPLOYED);

      await checkDeviceMotorCapacity(starter);
      const { motorReference, motorIndex } = await resolveMotorSlot(starter, validatedReqData.motor_reference);

      await db.transaction(async (trx) => {
        await updateRecordById<MotorsTable>(motors, motorId, {
          starter_id: starter.id,
          assigned_at: new Date(),
          motor_reference: motorReference,
          motor_index: motorIndex,
        }, trx);
        await ActivityService.logActivity({
          performedBy: userPayload.id,
          action: "MOTOR_ASSIGNED",
          entityType: "MOTOR",
          entityId: motorId,
          deviceId: starter.id,
          newData: { starter_id: starter.id, motor_reference: motorReference, motor_index: motorIndex }
        }, trx);
      });

      return sendResponse(c, 200, MOTOR_ASSIGNED_TO_DEVICE);
    } catch (error: any) {
      console.error("Error at assign motor to device:", error);
      handleJsonParseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

  updateMotorTestRunStatusHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +c.req.param("id");
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

  replaceMotorDeviceHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +c.req.param("id");
      paramsValidateException.validateId(motorId, "motor id");

      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedReplaceMotorDevice>("replace-motor-device", reqData, MOTOR_REPLACE_VALIDATION_CRITERIA);

      // Motor must exist and be assigned to a device
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      if (!motor.starter_id) throw new BadRequestException(MOTOR_NOT_ASSIGNED_TO_DEVICE);
      
      // New device must be different from current
      if (motor.starter_id === validatedReqData.new_starter_id) throw new ConflictException(MOTOR_SAME_DEVICE);

      // New device must exist and be deployed
      const newStarter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.new_starter_id, "ARCHIVED"]);
      if (!newStarter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      if (newStarter.device_status !== "DEPLOYED") throw new BadRequestException(STARTER_NOT_DEPLOYED);

      // Capacity and slot resolution for new device.
      // Old device slot is freed implicitly — updating motor.starter_id to
      // the new device automatically vacates the slot on the old device.
      await checkDeviceMotorCapacity(newStarter);
      const { motorReference: newMotorReference, motorIndex: newMotorIndex } =
        await resolveMotorSlot(newStarter, validatedReqData.motor_reference);

      const oldStarterId = motor.starter_id;
      const oldMotorReference = motor.motor_reference;
      const oldMotorIndex = motor.motor_index;

      await db.transaction(async (trx) => {
        await updateRecordById<MotorsTable>(motors, motorId, {
          starter_id: newStarter.id,
          assigned_at: new Date(),
          motor_reference: newMotorReference,
          motor_index: newMotorIndex,
        }, trx);
        await ActivityService.logActivity({
          performedBy: userPayload.id,
          action: "MOTOR_DEVICE_REPLACED",
          entityType: "MOTOR",
          entityId: motorId,
          deviceId: newStarter.id,
          oldData: { starter_id: oldStarterId, motor_reference: oldMotorReference, motor_index: oldMotorIndex },
          newData: { starter_id: newStarter.id, motor_reference: newMotorReference, motor_index: newMotorIndex }
        }, trx);
      });

      return sendResponse(c, 200, MOTOR_REPLACED_DEVICE);
    } catch (error: any) {
      console.error("Error at replace motor device:", error);
      handleJsonParseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

  detachMotorFromDeviceHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorId = +c.req.param("id");
      paramsValidateException.validateId(motorId, "motor id");

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      if (!motor.starter_id) throw new BadRequestException(MOTOR_NOT_ASSIGNED_TO_DEVICE);

      const previousStarterId = motor.starter_id;

      await db.transaction(async (trx) => {
        await updateRecordById<MotorsTable>(motors, motorId, {
          starter_id: null,
          motor_reference: null,
          motor_index: null,
        }, trx);
        await ActivityService.logActivity({
          performedBy: userPayload.id,
          action: "MOTOR_DETACHED",
          entityType: "MOTOR",
          entityId: motorId,
          deviceId: previousStarterId,
          oldData: { starter_id: previousStarterId, motor_reference: motor.motor_reference, motor_index: motor.motor_index }
        }, trx);
      });

      return sendResponse(c, 200, MOTOR_DETACHED_FROM_DEVICE);
    } catch (error: any) {
      console.error("Error at detach motor from device:", error);
      handleJsonParseError(error);
      throw error;
    }
  }
}