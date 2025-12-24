import { and, eq, ne } from "drizzle-orm";
import type { Context } from "hono";
import { DEPLOYED_STATUS_UPDATED, DEVICE_ANALYTICS_FETCHED, GATEWAY_NOT_FOUND, LOCATION_ASSIGNED, MOTOR_NAME_EXISTED, MOTOR_NOT_FOUND, REPLACE_STARTER_BOX_VALIDATION_CRITERIA, STARER_NOT_DEPLOYED, STARTER_ALREADY_ASSIGNED, STARTER_ASSIGNED_SUCCESSFULLY, STARTER_BOX_ADDED_SUCCESSFULLY, STARTER_BOX_DELETED_SUCCESSFULLY, STARTER_BOX_NOT_FOUND, STARTER_BOX_STATUS_UPDATED, STARTER_BOX_VALIDATION_CRITERIA, STARTER_CONNECTED_MOTORS_FETCHED, STARTER_DETAILS_UPDATED, STARTER_LIST_FETCHED, STARTER_REMOVED_SUCCESS, STARTER_REPLACED_SUCCESSFULLY, STARTER_RUNTIME_FETCHED, USER_NOT_FOUND } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { gateways, type GatewayTable } from "../database/schemas/gateways.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import { users, type User, type UsersTable } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { parseQueryDates } from "../helpers/dns-helpers.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { starterFilters } from "../helpers/starter-helper.js";
import { getRecordsCount, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "../services/db/base-db-services.js";
import { getMotorRunTime, updateMotorStateByStarterIds } from "../services/db/motor-services.js";
import { addStarterWithTransaction, assignStarterWebWithTransaction, assignStarterWithTransaction, findStarterByPcbOrStarterNumber, getStarterAnalytics, getStarterRunTime, getUniqueStarterIdsWithInTime, paginatedStarterList, paginatedStarterListForMobile, replaceStarterWithTransaction, starterConnectedMotors, updateStarterStatus } from "../services/db/starter-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddStarter, validatedAssignLocationToStarter, validatedAssignStarter, validatedAssignStarterWeb, validatedReplaceStarter, validatedUpdateDeployedStatus } from "../validations/schema/starter-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();

export class StarterHandlers {
  addStarterBox = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const starterBoxPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(starterBoxPayload);

      const validStarterBoxReq = await validatedRequest<validatedAddStarter>("add-starter", starterBoxPayload, STARTER_BOX_VALIDATION_CRITERIA);

      if (validStarterBoxReq.gateway_id) {
        const existedGateway = await getSingleRecordByMultipleColumnValues<GatewayTable>(gateways, ["id", "status"], ["=", "!="], [validStarterBoxReq.gateway_id, "ARCHIVED"]);
        if (!existedGateway) throw new BadRequestException(GATEWAY_NOT_FOUND);
      }

      await addStarterWithTransaction(validStarterBoxReq, userPayload);
      return sendResponse(c, 201, STARTER_BOX_ADDED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at add starter box :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at add starter box :", error);
      throw error;
    }
  }


  assignStarterMobile = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignStarter>("assign-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await findStarterByPcbOrStarterNumber(validatedReqData.pcb_number);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);

      const existedMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["location_id", "alias_name", "status"], ["=", "=", "!="], [validatedReqData.location_id, validatedReqData.motor_name, "ARCHIVED"]);
      if (existedMotor) throw new BadRequestException(MOTOR_NAME_EXISTED);

      const motorCount = await getRecordsCount(motors, [eq(motors.starter_id, starterBox.id), ne(motors.status, "ARCHIVED")]);
      if (starterBox.device_status === "ASSIGNED" && motorCount > 0) throw new BadRequestException(STARTER_ALREADY_ASSIGNED);
      if (starterBox.device_status !== "DEPLOYED") throw new BadRequestException(STARER_NOT_DEPLOYED);

      await assignStarterWithTransaction(validatedReqData, userPayload, starterBox);
      return sendResponse(c, 201, STARTER_ASSIGNED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at assign starter :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at assign starter :", error);
      throw error;
    }
  }

  starterListWeb = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);
      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = starterFilters(query, userPayload);
      const starterList = await paginatedStarterList(whereQueryData, orderQueryData, paginationParams);
      return sendResponse(c, 200, STARTER_LIST_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at starter list for web :", error);
      throw error;
    }
  }


  starterListMobile = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);
      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = starterFilters(query, userPayload);
      const starterList = await paginatedStarterListForMobile(whereQueryData, orderQueryData, paginationParams);
      return sendResponse(c, 200, STARTER_LIST_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at starter list for mobile :", error);
      throw error;
    }
  }


  deleteStarterBox = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const starterId = +c.req.param("id");

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["starter_id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      let message = "";

      if (starter.starter_type === "SINGLE_STARTER") {
        await db.transaction(async (trx) => {
          if (userPayload.user_type === "USER") {
            await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starterId, { user_id: null, device_status: "DEPLOYED" }, trx);
            saveSingleRecord<MotorsTable>(motors, { name: `Pump 1 - ${starter.pcb_number}`, hp: String(2), starter_id: starterId }, trx);
          }
          if (userPayload.user_type === "ADMIN") await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter.id, { user_id: null, status: "ARCHIVED", location_id: null }, trx);
          if (motor) await trx.update(motors).set({ status: "ARCHIVED" }).where(and(eq(motors.starter_id, starter.id), eq(motors.id, motor.id)));
        });
      }
      if (userPayload.user_type === "USER") {
        message = STARTER_REMOVED_SUCCESS;
      } else {
        message = STARTER_BOX_DELETED_SUCCESSFULLY;
      }

      return sendResponse(c, 200, message);
    } catch (error: any) {
      console.error("Error at delete starter :", error);
      throw error;
    }
  }


  replaceStarterLocation = async (c: Context) => {
    try {
      const starterPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(starterPayload);
      const validatedStarterReq = await validatedRequest<validatedReplaceStarter>("replace-starter", starterPayload, REPLACE_STARTER_BOX_VALIDATION_CRITERIA);
      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedStarterReq.starter_id, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [validatedStarterReq.motor_id, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      await replaceStarterWithTransaction(motor, starter, validatedStarterReq.location_id);
      return sendResponse(c, 201, STARTER_REPLACED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at replace starter :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at replace starter :", error);
      throw error;
    }
  }

  starterAnalytics = async (c: Context) => {
    try {
      const query = c.req.query();
      const starterId = +c.req.param("id");
      const motorId = +query.motor_id
      paramsValidateException.validateId(starterId, "Device id");
      if (motorId) paramsValidateException.validateId(motorId, "Motor id");

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      if (motorId) {
        const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
        if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      }

      const parameter = query.parameter;
      const { fromDateUTC, toDateUTC } = parseQueryDates(query);

      const starterList = await getStarterAnalytics(starterId, fromDateUTC, toDateUTC, parameter, motorId);
      return sendResponse(c, 200, DEVICE_ANALYTICS_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at starter analytics :", error);
      throw error;
    }
  }

  starterRunTime = async (c: Context) => {
    try {
      const query = c.req.query();
      const starterId = +c.req.param("id");
      const motorId = +query.motor_id;
      paramsValidateException.validateId(starterId, "Device id");

      if (motorId) paramsValidateException.validateId(motorId, "Motor id");

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      if (motorId) {
        const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
        if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);
      }

      let powerState = query.power || "";
      let motorState = query.state || "";

      const { fromDateUTC, toDateUTC } = parseQueryDates(query);
      const starterList = query.parameter === "power" ? await getStarterRunTime(starterId, fromDateUTC, toDateUTC, motorId, powerState) : await getMotorRunTime(starterId, fromDateUTC, toDateUTC, motorId, motorState);
      return sendResponse(c, 200, STARTER_RUNTIME_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at device run time :", error);
      throw error;
    }
  }

  assignStarterWeb = async (c: Context) => {
    try {

      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignStarterWeb>("assign-starter-web", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"], ["id", "device_status", "status"]);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);
      const user = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["id", "status"], ["=", "!="], [userPayload.id, "ARCHIVED"]);
      if (!user) throw new BadRequestException(USER_NOT_FOUND);

      if (starterBox.device_status !== "DEPLOYED") throw new BadRequestException(STARER_NOT_DEPLOYED);

      await assignStarterWebWithTransaction(starterBox, validatedReqData, userPayload);
      return sendResponse(c, 201, STARTER_ASSIGNED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at assign starter web :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at assign starter web :", error);
      throw error;
    }
  }


  updateDeployStatus = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      const starterId = +c.req.param("id");
      paramsValidateException.validateId(starterId, "Device id");
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedUpdateDeployedStatus>("update-deployed-status", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["id", "device_status", "status"]);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);

      await db.transaction(async (trx) => {
        updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starterBox.id, { device_status: validatedReqData.deploy_status }, trx);
      })
      return sendResponse(c, 201, DEPLOYED_STATUS_UPDATED);
    } catch (error: any) {
      console.error("Error at update device status :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at update device status :", error);
      throw error;
    }
  }

  starterConnectedMotors = async (c: Context) => {
    try {
      const starterId = +c.req.param("id");
      paramsValidateException.validateId(starterId, "Device id");
      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      const connectedMotors = await starterConnectedMotors(starterId);
      return sendResponse(c, 200, STARTER_CONNECTED_MOTORS_FETCHED, connectedMotors);
    } catch (error: any) {
      console.error("Error at starter connected motors :", error);
      throw error;
    }
  }

  assignLocationToStarter = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignLocationToStarter>("assign-location-to-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, { location_id: validatedReqData.location_id, user_id: userPayload.id });
      return sendResponse(c, 201, LOCATION_ASSIGNED);
    } catch (error: any) {
      console.error("Error at assign location to starter :", error);
      handleJsonParseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at assign location to starter :", error);
      throw error;
    }
  }

  updateStarterDetails = async (c: Context) => {
    try {
      const starterId = +c.req.param("id");
      const reqData = await c.req.json();
      paramsValidateException.validateId(starterId, "Device id");
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAddStarter>("add-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, validatedReqData);
      return sendResponse(c, 201, STARTER_DETAILS_UPDATED);
    } catch (error: any) {
      console.error("Error at update starter details :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at update starter details :", error);
      throw error;
    }
  }


  markStarterStatus = async (c: Context) => {
    try {
      const timeStamp = new Date(new Date().getTime() - 5 * 60 * 1000); // 5 minutes below
      const uniqueStarterData = await getUniqueStarterIdsWithInTime(timeStamp);
      const updatedStarterStatus = await updateStarterStatus(uniqueStarterData);
      updateMotorStateByStarterIds(updatedStarterStatus);
      return sendResponse(c, 200, STARTER_BOX_STATUS_UPDATED);
    }
    catch (error: any) {
      console.error("Error at mark starter inactive:", error.message);
      throw error;
    }
  };
}