import type { Context } from "hono";
import { MOTOR_ADDED, MOTOR_DELETED, MOTOR_DETAILS_FETCHED, MOTOR_NOT_FOUND, MOTOR_UPDATED, MOTOR_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { motorFilters } from "../helpers/motor-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { paginatedMotorsList } from "../services/db/motor-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddMotor, validatedUpdateMotor } from "../validations/schema/motor-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import { getMotorWithStarterDetails } from "../services/db/motor-starter-services.js";

const paramsValidateException = new ParamsValidateException();

export class MotorHandlers {

  addMotor = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(motorPayload);
      const validMotorReq = await validatedRequest<validatedAddMotor>("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);

      // const field = await getSingleRecordByMultipleColumnValues<FieldsTable>(fields, ["id", "status"], ["=", "!="], [validMotorReq.field_id, "ARCHIVED"]);
      // if (!field) throw new NotFoundException(FIELD_NOT_FOUND);
      const preparedMotorPayload: any = {
        name: validMotorReq.name, created_by: userPayload.id, location_id: validMotorReq.location_id,
        hp: validMotorReq.hp.toString(),
      }

      await saveSingleRecord<MotorsTable>(motors, preparedMotorPayload);
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

  updateMotor = async (c: Context) => {
    try {
      const motorId = +c.req.param("id");
      const motorPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(motorPayload);
      const validMotorReq = await validatedRequest<validatedUpdateMotor>("update-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);

      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      await updateRecordById(motors, motorId, { alias_name: validMotorReq.name, hp: validMotorReq.hp.toString() });
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

  getSingleMotor = async (c: Context) => {
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

  deleteMotor = async (c: Context) => {
    try {
      const motorId = +c.req.param("id");
      paramsValidateException.validateId(motorId, "motor id");
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      db.transaction(async trx => {
        await updateRecordById<MotorsTable>(motors, motorId, { status: "ARCHIVED" });
        await updateRecordById<StarterBoxTable>(starterBoxes, motor.starter_id, { device_status: "DEPLOYED", user_id: null });
      })
      return sendResponse(c, 200, MOTOR_DELETED);
    } catch (error: any) {
      console.error("Error at delete motor :", error);
      throw error;
    }
  }


  getAllMotors = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);
      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = motorFilters(query, userPayload);
      const motors = await paginatedMotorsList(whereQueryData, orderQueryData, paginationParams);
      return sendResponse(c, 200, MOTOR_DETAILS_FETCHED, motors);
    } catch (error: any) {
      console.error("Error at get all motors :", error);
      throw error;
    }
  }
}