import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { Context } from "hono";
import { DEPLOYED_STATUS_UPDATED, DEVICE_ANALYTICS_FETCHED, GATEWAY_NOT_FOUND, LATEST_PCB_NUMBER_FETCHED_SUCCESSFULLY, LOCATION_ASSIGNED, MOTOR_NAME_ALREADY_LOCATION, MOTOR_NOT_FOUND, REPLACE_STARTER_BOX_VALIDATION_CRITERIA, STARTER_ALREADY_ASSIGNED, STARTER_ASSIGNED_SUCCESSFULLY, STARTER_BOX_ADDED_SUCCESSFULLY, STARTER_BOX_DELETED_SUCCESSFULLY, STARTER_BOX_NOT_FOUND, STARTER_BOX_STATUS_UPDATED, STARTER_BOX_VALIDATION_CRITERIA, STARTER_CONNECTED_MOTORS_FETCHED, STARTER_DETAILS_UPDATED, STARTER_LIST_FETCHED, STARTER_NOT_DEPLOYED, STARTER_REMOVED_SUCCESS, STARTER_REPLACED_SUCCESSFULLY, STARTER_RUNTIME_FETCHED, TEMPERATURE_FETCHED, USER_NOT_FOUND } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { deviceTemperature, type DeviceTemperatureTable } from "../database/schemas/device-temperature.js";
import { gateways, type GatewayTable } from "../database/schemas/gateways.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import { type NewUserActivityLog } from "../database/schemas/user-activity-logs.js";
import { users, type User, type UsersTable } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { parseQueryDates } from "../helpers/dns-helpers.js";
import { getPaginationData, getPaginationOffParams } from "../helpers/pagination-helper.js";
import { starterFilters } from "../helpers/starter-helper.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getConsecutiveAlertsPaginated, getConsecutiveFaultsPaginated, getConsecutiveGroupsCount } from "../services/db/alerts-services.js";
import { getRecordsConditionally, getRecordsCount, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "../services/db/base-db-services.js";
import { getMotorRunTime, updateStarterStatusWithTransaction } from "../services/db/motor-services.js";
import { addStarterWithTransaction, assignStarterWebWithTransaction, assignStarterWithTransaction, findStarterByPcbOrStarterNumber, getStarterAnalytics, getStarterRunTime, getUniqueStarterIdsWithInTime, paginatedStarterList, paginatedStarterListForMobile, replaceStarterWithTransaction, starterConnectedMotors } from "../services/db/starter-services.js";
import type { OrderByQueryData, WhereQueryData } from "../types/db-types.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { logger } from "../utils/logger.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddStarter, validatedAssignLocationToStarter, validatedAssignStarter, validatedAssignStarterWeb, validatedReplaceStarter, validatedUpdateDeployedStatus } from "../validations/schema/starter-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();

export class StarterHandlers {
  addStarterBoxHandler = async (c: Context) => {
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

  getConsecutiveAlertsFaultsHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const starterId = +c.req.param("starter_id");
      const motorId = +c.req.param("motor_id");
      const type = query.type as string || "alert";

      // Validate IDs
      paramsValidateException.validateId(starterId, "Starter id");
      paramsValidateException.validateId(motorId, "Motor id");

      const { page, pageSize, offset } = getPaginationOffParams(query);

      // Fetch consecutive grouped data
      const data = type === "fault"
        ? await getConsecutiveFaultsPaginated(starterId, motorId, offset, pageSize)
        : await getConsecutiveAlertsPaginated(starterId, motorId, offset, pageSize);

      const message = type === "fault" ? "Faults fetched successfully" : "Alerts fetched successfully";

      // Get total count from service
      const totalRecords = await getConsecutiveGroupsCount(starterId, motorId, type as 'alert' | 'fault');
      const paginationInfo = getPaginationData(page, pageSize, totalRecords);

      const response = {
        pagination: paginationInfo,
        records: data || [],
      };

      return sendResponse(c, 200, message, response);
    } catch (error: any) {
      logger.error("Error at getConsecutiveAlertsFaultsHandler :", error);
      console.error("Error at getConsecutiveAlertsFaultsHandler :", error);
      throw error;
    }
  }

  assignStarterMobileHandler = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignStarter>("assign-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await findStarterByPcbOrStarterNumber(validatedReqData.pcb_number);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);

      const lowerCaseTitle = validatedReqData.motor_name.trim().toLocaleLowerCase();

      const existedMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["location_id", "alias_name", "status"], ["=", "LOWER", "!="], [validatedReqData.location_id, lowerCaseTitle, "ARCHIVED"]);
      if (existedMotor) throw new ConflictException(MOTOR_NAME_ALREADY_LOCATION);

      const motorCount = await getRecordsCount(motors, [eq(motors.starter_id, starterBox.id), ne(motors.status, "ARCHIVED")]);
      if (starterBox.device_status === "ASSIGNED" && motorCount > 0) throw new BadRequestException(STARTER_ALREADY_ASSIGNED);
      if (starterBox.device_status !== "DEPLOYED") throw new BadRequestException(STARTER_NOT_DEPLOYED);

      await db.transaction(async (trx) => {
        const { updatedStarter, updatedMotor } = await assignStarterWithTransaction(validatedReqData, userPayload, starterBox, trx);

        await ActivityService.writeStarterAssignedLog(userPayload.id, starterBox.id, {
          user_id: userPayload.id,
          location_id: updatedStarter.location_id,
          motor_name: updatedMotor.alias_name
        }, trx);
      });

      return sendResponse(c, 201, STARTER_ASSIGNED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at assign starter :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  }

  starterListWebHandler = async (c: Context) => {
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


  starterListMobileHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);
      const orderQueryData = parseOrderByQueryCondition<StarterBoxTable>(query.order_by, query.order_type, "assigned_at", "desc");
      const whereQueryData = starterFilters(query, userPayload);
      const starterList = await paginatedStarterListForMobile(whereQueryData, orderQueryData, paginationParams);
      return sendResponse(c, 200, STARTER_LIST_FETCHED, starterList);
    } catch (error: any) {
      console.error("Error at starter list for mobile :", error);
      throw error;
    }
  }


  deleteStarterBoxHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const starterId = +c.req.param("id");

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["starter_id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      let message = "";

      const activityLogs: NewUserActivityLog[] = [];
      await db.transaction(async (trx) => {
        if (userPayload.user_type === "USER") {
          await updateRecordById<StarterBoxTable>(starterBoxes, starterId, { user_id: null, device_status: "DEPLOYED", location_id: null }, trx);
          await saveSingleRecord<MotorsTable>(motors, { name: `Pump 1 - ${starter.pcb_number}`, hp: String(2), starter_id: starterId }, trx);
        }
        if (userPayload.user_type === "ADMIN") {
          await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, { user_id: null, status: "ARCHIVED", location_id: null }, trx);
        }
        if (motor) {
          await trx.update(motors).set({ status: "ARCHIVED" }).where(and(eq(motors.starter_id, starter.id), eq(motors.id, motor.id)));
        }

        if (activityLogs.length > 0) {
          await ActivityService.writeBatchDeletionLogs(activityLogs, trx);
        }
      });

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


  replaceStarterLocationHandler = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const starterPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(starterPayload);
      const validatedStarterReq = await validatedRequest<validatedReplaceStarter>("replace-starter", starterPayload, REPLACE_STARTER_BOX_VALIDATION_CRITERIA);
      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedStarterReq.starter_id, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["id", "status"], ["=", "!="], [validatedStarterReq.motor_id, "ARCHIVED"]);
      if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

      const loweCaseLication = motor.alias_name?.trim().toLocaleLowerCase();
      let foundMotorName;

      if (loweCaseLication) {
        foundMotorName = await getSingleRecordByMultipleColumnValues<MotorsTable>(motors, ["alias_name", "location_id", "status"], ["LOWER", "=", "!="], [loweCaseLication, validatedStarterReq.location_id, "ARCHIVED"]);
      }
      if (foundMotorName) throw new ConflictException(MOTOR_NAME_ALREADY_LOCATION);

      await db.transaction(async (trx) => {
        const { updatedMotor, updatedStarter } = await replaceStarterWithTransaction(motor, starter, validatedStarterReq.location_id) as any;

        await ActivityService.writeLocationReplacedLog(userPayload.id, starter.id,
          { location_id: starter.location_id },
          { location_id: updatedStarter.location_id, motor_id: updatedMotor.id },
          trx
        );
      });

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

  starterAnalyticsHandler = async (c: Context) => {
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

  starterRunTimeHandler = async (c: Context) => {
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

  assignStarterWebHandler = async (c: Context) => {
    try {

      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignStarterWeb>("assign-starter-web", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);
      const user = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["id", "status"], ["=", "!="], [userPayload.id, "ARCHIVED"]);
      if (!user) throw new BadRequestException(USER_NOT_FOUND);

      if (starterBox.device_status !== "DEPLOYED") throw new BadRequestException(STARTER_NOT_DEPLOYED);

      await db.transaction(async (trx) => {
        const { updatedStarter } = await assignStarterWebWithTransaction(starterBox, validatedReqData) as any;
        await ActivityService.writeStarterAssignedLog(userPayload.id, (starterBox as any).id, { user_id: updatedStarter.user_id }, trx);
      });

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


  updateDeployStatusHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const reqData = await c.req.json();
      const starterId = +c.req.param("id");
      paramsValidateException.validateId(starterId, "Device id");
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedUpdateDeployedStatus>("update-deployed-status", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["id", "device_status", "status"]);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);

      const updateData: Record<string, any> = { device_status: validatedReqData.deploy_status };

      if (validatedReqData.deploy_status === "DEPLOYED") {
        updateData.deployed_at = new Date();
      } else if (validatedReqData.deploy_status === "ASSIGNED") {
        updateData.assigned_at = new Date();
      }

      await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starterBox.id, updateData, trx);

        await ActivityService.logActivity({
          userId: userPayload.id,
          performedBy: userPayload.id,
          action: "DEPLOY_STATUS_UPDATE",
          entityType: "STARTER",
          entityId: starterBox.id,
          oldData: { status: starterBox.device_status },
          newData: { status: validatedReqData.deploy_status }
        }, trx);
      });
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

  starterConnectedMotorsHandler = async (c: Context) => {
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

  assignLocationToStarterHandler = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignLocationToStarter>("assign-location-to-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      await db.transaction(async (trx) => {
        const updatedStarter = await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, { location_id: validatedReqData.location_id, user_id: userPayload.id }, trx);
        await ActivityService.logActivity({
          performedBy: userPayload.id,
          action: "LOCATION_ASSIGNED",
          entityType: "STARTER",
          entityId: starter.id,
          newData: { location_id: updatedStarter.location_id }
        }, trx);
      });
      return sendResponse(c, 201, LOCATION_ASSIGNED);
    } catch (error: any) {
      console.error("Error at assign location to starter :", error);
      handleJsonParseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at assign location to starter :", error);
      throw error;
    }
  }

  updateStarterDetailsHandler = async (c: Context) => {
    try {
      const starterId = +c.req.param("id");
      const reqData = await c.req.json();
      paramsValidateException.validateId(starterId, "Device id");
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAddStarter>("add-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      const userId = (c.get("user_payload") as User).id;
      await db.transaction(async (trx) => {
        const updatedStarter = await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, validatedReqData, trx);

        await ActivityService.writeStarterUpdatedLog(userId, starterId,
          {
            name: starter.name,
            pcb_number: starter.pcb_number,
            starter_number: starter.starter_number,
            mac_address: starter.mac_address,
            gateway_id: starter.gateway_id,
            device_mobile_number: starter.device_mobile_number
          },
          {
            name: updatedStarter.name,
            pcb_number: updatedStarter.pcb_number,
            starter_number: updatedStarter.starter_number,
            mac_address: updatedStarter.mac_address,
            gateway_id: updatedStarter.gateway_id,
            device_mobile_number: updatedStarter.device_mobile_number
          },
          trx
        );
      });

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


  markStarterStatusHandler = async (c: Context) => {
    try {
      const timeStamp = new Date(new Date().getTime() - 5 * 60 * 1000); // 5 minutes below
      const uniqueStarterData = await getUniqueStarterIdsWithInTime(timeStamp);
      await updateStarterStatusWithTransaction(uniqueStarterData);
      return sendResponse(c, 200, STARTER_BOX_STATUS_UPDATED);
    }
    catch (error: any) {
      console.error("Error at mark starter inactive:", error.message);
      throw error;
    }
  };

  getLatestPcbNumberHandler = async (c: Context) => {
    try {

      const latestStarter = await db.select({
        id: starterBoxes.id,
        pcbNumber: starterBoxes.pcb_number,
      }).from(starterBoxes).where(
        and(
          isNotNull(starterBoxes.pcb_number)
        )
      ).orderBy(desc(starterBoxes.created_at)).limit(1);

      return sendResponse(c, 200, LATEST_PCB_NUMBER_FETCHED_SUCCESSFULLY, latestStarter);
    } catch (error: any) {
      console.error("Error at get latest PCB number :", error);
      throw error;
    }
  }

  getTemperatureHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const starterId = +c.req.param("id");
      const motor_id = +query.motor_id;
      paramsValidateException.validateId(starterId, "Device id");
      if (motor_id) paramsValidateException.validateId(motor_id, "Motor id");

      const { fromDateUTC, toDateUTC } = parseQueryDates(query);

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      const where: WhereQueryData<DeviceTemperatureTable> = { columns: ["device_id"], relations: ["="], values: [starter.id] }
      if (motor_id) {
        where.columns.push("motor_id"); where.relations.push("="); where.values.push(motor_id);
      }
      if (fromDateUTC) {
        where.columns.push("time_stamp"); where.relations.push(">="); where.values.push(fromDateUTC);
      }
      if (toDateUTC) {
        where.columns.push("time_stamp"); where.relations.push("<="); where.values.push(toDateUTC);
      }

      const orderBy: OrderByQueryData<DeviceTemperatureTable> = { columns: ["created_at"], values: ["asc"] }
      const columns = ["id", "device_id", "temperature", "time_stamp"]

      const temperature = await getRecordsConditionally<DeviceTemperatureTable>(deviceTemperature, where, columns, orderBy);
      return sendResponse(c, 200, TEMPERATURE_FETCHED, temperature);
    } catch (error: any) {
      console.error("Error at get temperature :", error);
      throw error;
    }
  }

  updateDeviceAllocationHandler = async (c: Context) => {
    try {
      const starterId = +c.req.param("id");
      const body = await c.req.json();
      const allocationStatus = body.allocation_status;
      paramsValidateException.validateId(starterId, "Device id");
      if (!allocationStatus || (allocationStatus !== "true" && allocationStatus !== "false")) {
        throw new BadRequestException("Invalid allocation status. It should be 'true' or 'false'.");
      }

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      await updateRecordById<StarterBoxTable>(starterBoxes, starterId, { device_allocation: allocationStatus });
      return sendResponse(c, 200, "Device allocation status updated successfully");
    } catch (error: any) {
      console.error("Error at update device allocation status :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at update device allocation status :", error);
      throw error;
    }
  }
}