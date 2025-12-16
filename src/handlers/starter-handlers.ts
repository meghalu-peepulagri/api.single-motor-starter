import { eq } from "drizzle-orm";
import type { Context } from "hono";
import moment from "moment";
import { GATEWAY_NOT_FOUND, MOTOR_NOT_FOUND, REPLACE_STARTER_BOX_VALIDATION_CRITERIA, STARER_NOT_DEPLOYED, STARTER_ALREADY_ASSIGNED, STARTER_ASSIGNED_SUCCESSFULLY, STARTER_BOX_ADDED_SUCCESSFULLY, STARTER_BOX_DELETED_SUCCESSFULLY, STARTER_BOX_NOT_FOUND, STARTER_BOX_VALIDATION_CRITERIA, STARTER_LIST_FETCHED, STARTER_REMOVED_SUCCESS, STARTER_REPLACED_SUCCESSFULLY, STARTER_RUNTIME_FETCHED } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { gateways, type GatewayTable } from "../database/schemas/gateways.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import type { User } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getUTCFromDateAndToDate, parseQueryDates } from "../helpers/dns-helpers.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { starterFilters } from "../helpers/starter-hepler.js";
import { getSingleRecordByMultipleColumnValues, updateRecordByIdWithTrx } from "../services/db/base-db-services.js";
import { getMotorRunTime } from "../services/db/motor-service.js";
import { addStarterWithTransaction, assignStarterWithTransaction, getStarterAnalytics, getStarterRunTime, paginatedStarterList, paginatedStarterListForMobile, replaceStarterWithTransaction } from "../services/db/starter-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddStarter, validatedAssignStarter, validatedReplaceStarter } from "../validations/schema/starter-validations.js";
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
      const starterBox = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["pcb_number", "status"], ["LOWER", "!="], [validatedReqData.pcb_number.toLowerCase(), "ARCHIVED"], ["id", "device_status", "status"]);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);
      if (starterBox.device_status === "ASSIGNED") throw new BadRequestException(STARTER_ALREADY_ASSIGNED);
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
      let message = "";

      if (starter.starter_type === "SINGLE_STARTER") {
        await db.transaction(async (trx) => {
          await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starterId, { user_id: null, device_status: "DEPLOYED" }, trx);
          await trx.update(motors).set({ status: "ARCHIVED" }).where(eq(motors.starter_id, starterId));
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
      const motorId = +c.req.param("motor_id");
      paramsValidateException.validateId(starterId, "Device id");
      paramsValidateException.validateId(motorId, "Motor id");

      let fromDate = query.from_date || "";
      let toDate = query.to_date || "";
      const parameter = query.parameter;

      if (!fromDate || !toDate) {
        const today = moment().tz("Asia/Kolkata");
        const startDay = today.clone().subtract(24, "hours").format();
        const endDay = today.format();
        const { startOfDayUTC, endOfDayUTC } = getUTCFromDateAndToDate(startDay, endDay);
        fromDate = startOfDayUTC;
        toDate = endOfDayUTC;
      }

      const starterList = await getStarterAnalytics(starterId, motorId, fromDate, toDate, parameter);
      return sendResponse(c, 200, STARTER_LIST_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at starter analytics :", error);
      throw error;
    }
  }

  deviceRunTime = async (c: Context) => {
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
      console.log('toDateUTC: ', toDateUTC);
      console.log('fromDateUTC: ', fromDateUTC);
      const starterList = query.parameter === "power" ? await getStarterRunTime(starterId, fromDateUTC, toDateUTC, motorId, powerState) : await getMotorRunTime(starterId, fromDateUTC, toDateUTC, motorId, motorState);
      console.log('starterList: ', starterList);

      return sendResponse(c, 200, STARTER_RUNTIME_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at device run time :", error);
      throw error;
    }
  }
}