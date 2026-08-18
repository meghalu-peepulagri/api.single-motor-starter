import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { requestTypesFor } from "../helpers/packet-types-helper.js";
import { DEPLOYED_STATUS_UPDATED, DEVICE_ANALYTICS_FETCHED, DEVICE_NOT_ALLOCATED, DEVICE_NOT_FOUND, DEVICE_RESET_SUCCESSFULLY, FAULT_CLEARED_SUCCESSFULLY, LATEST_PCB_NUMBER_FETCHED_SUCCESSFULLY, LOCATION_ASSIGNED, MOTOR_NAME_ALREADY_LOCATION, MOTOR_NOT_FOUND, NO_ACTIVE_FAULT_FOUND, PCB_NUMBER_REQUIRED, REPLACE_STARTER_BOX_VALIDATION_CRITERIA, SETTINGS_SYNC_STATUS_UPDATED, SIM_RECHARGE_EXPIRY_NOTIFICATIONS_SENT, STARTER_ALREADY_ASSIGNED, STARTER_ASSIGNED_SUCCESSFULLY, STARTER_BOX_ADDED_SUCCESSFULLY, STARTER_BOX_DELETED_SUCCESSFULLY, STARTER_BOX_NOT_FOUND, STARTER_BOX_STATUS_UPDATED, STARTER_BOX_VALIDATION_CRITERIA, STARTER_CONNECTED_MOTORS_FETCHED, STARTER_DETAILS_UPDATED, STARTER_LIST_FETCHED, STARTER_NOT_DEPLOYED, STARTER_REMOVED_SUCCESS, STARTER_REPLACED_SUCCESSFULLY, STARTER_RUNTIME_FETCHED, TEMPERATURE_FETCHED, USER_NOT_FOUND } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { deviceTemperature } from "../database/schemas/device-temperature.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { users } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import { parseQueryDates } from "../helpers/dns-helpers.js";
import { getPaginationData, getPaginationOffParams } from "../helpers/pagination-helper.js";
import { processSimRechargeExpiryNotifications, starterCountFilters, starterFilters } from "../helpers/starter-helper.js";
import { clearSettingsSyncAttempts } from "../helpers/ack-tracker-hepler.js";
import { isDualMotor, isInvalidVersionMotorPair, payloadVersionOf } from "../helpers/payload-version-helper.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { PAYLOAD_VERSION_DUAL_MOTOR_INVALID, PAYLOAD_VERSION_MOTOR_CHANGE_NOT_ALLOWED } from "../constants/app-constants.js";
import { publishMultipleTimesInBackground } from "../helpers/settings-helpers.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getConsecutiveAlertsPaginated, getConsecutiveFaultsPaginated, getConsecutiveGroupsCount, getUnifiedLogsCount, getUnifiedLogsPaginated } from "../services/db/alerts-services.js";
import { getRecordsConditionally, getRecordsCount, getSingleRecordByMultipleColumnValues, updateRecordById, updateRecordByIdWithTrx } from "../services/db/base-db-services.js";
import { gatewayConflicts } from "../services/db/gateway-services.js";
import { getMotorRunTime, updateStarterStatusWithTransaction } from "../services/db/motor-services.js";
import { addStarterWithTransaction, applyDeviceAllocation, assignStarterWebWithTransaction, assignStarterWithTransaction, findStarterByPcbOrStarterNumber, getBasicStarterDetails, getDeviceWithDispatchDetails, getStarterMotorsByPcb, getStarterAnalytics, getStarterRunTime, getUniqueStarterIdsWithInTime, paginatedStarterList, paginatedStarterListForMobile, replaceStarterWithTransaction, starterConnectedMotors } from "../services/db/starter-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { logger } from "../utils/logger.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { starterDispatch } from "../database/schemas/starter-dispatch.js";
import { starterBoxParameters } from "../database/schemas/starter-parameters.js";
import { randomSequenceNumber } from "../helpers/mqtt-helpers.js";
import { generateDownloadUrl, generateUploadUrl } from "../services/s3/s3-service.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class StarterHandlers {
    addStarterBoxHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterBoxPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(starterBoxPayload);
            const validStarterBoxReq = await validatedRequest("add-starter", starterBoxPayload, STARTER_BOX_VALIDATION_CRITERIA);
            const existedGateway = await gatewayConflicts(validStarterBoxReq.gateway_id ?? undefined);
            const starter = await addStarterWithTransaction(validStarterBoxReq, userPayload, existedGateway?.id);
            const { id, ...restStarterData } = starter;
            await ActivityService.logActivity({
                performedBy: userPayload.id,
                action: "DEVICE_ADDED",
                entityType: "STARTER",
                entityId: id,
                newData: { pcb_number: validStarterBoxReq.pcb_number, name: validStarterBoxReq.name },
            });
            return sendResponse(c, 201, STARTER_BOX_ADDED_SUCCESSFULLY, { id });
        }
        catch (error) {
            console.error("Error at add starter box :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at add starter box :", error);
            throw error;
        }
    };
    getConsecutiveAlertsFaultsHandler = async (c) => {
        try {
            const query = c.req.query();
            const starterId = +(c.req.param("starter_id") ?? 0);
            const motorId = +(c.req.param("motor_id") ?? 0);
            const type = query.type || "alert";
            // Validate IDs
            paramsValidateException.validateId(starterId, "Starter id");
            paramsValidateException.validateId(motorId, "Motor id");
            const { page, pageSize, offset } = getPaginationOffParams(query);
            const assignedAt = query.is_assigned === "true" ? await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["assigned_at"]) : null;
            const assignedAtDate = assignedAt?.assigned_at ?? null;
            const data = type === "fault"
                ? await getConsecutiveFaultsPaginated(starterId, motorId, offset, pageSize, assignedAtDate)
                : await getConsecutiveAlertsPaginated(starterId, motorId, offset, pageSize, assignedAtDate);
            const message = type === "fault" ? "Faults fetched successfully" : "Alerts fetched successfully";
            const totalRecords = await getConsecutiveGroupsCount(starterId, motorId, type, assignedAtDate);
            const paginationInfo = getPaginationData(page, pageSize, totalRecords);
            const response = {
                pagination: paginationInfo,
                records: data || [],
            };
            return sendResponse(c, 200, message, response);
        }
        catch (error) {
            logger.error("Error at getConsecutiveAlertsFaultsHandler :", error);
            console.error("Error at getConsecutiveAlertsFaultsHandler :", error);
            throw error;
        }
    };
    getUnifiedLogsHandler = async (c) => {
        try {
            const query = c.req.query();
            const starterId = +(c.req.param("starter_id") ?? 0);
            const motorId = +(c.req.param("motor_id") ?? 0);
            paramsValidateException.validateId(starterId, "Starter id");
            paramsValidateException.validateId(motorId, "Motor id");
            const logTypes = query.log_type
                ? query.log_type.split(",").map((t) => t.trim().toLowerCase())
                : null;
            const { page, pageSize, offset } = getPaginationOffParams(query);
            const assignedAt = query.is_assigned === "true" ? await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["assigned_at"]) : null;
            const assignedAtDate = assignedAt?.assigned_at ?? null;
            const [data, totalRecords] = await Promise.all([
                getUnifiedLogsPaginated(starterId, motorId, offset, pageSize, assignedAtDate, logTypes),
                getUnifiedLogsCount(starterId, motorId, assignedAtDate, logTypes),
            ]);
            const paginationInfo = getPaginationData(page, pageSize, totalRecords);
            const response = {
                pagination: paginationInfo,
                records: data || [],
            };
            return sendResponse(c, 200, "Logs fetched successfully", response);
        }
        catch (error) {
            logger.error("Error at getUnifiedLogsHandler :", error);
            console.error("Error at getUnifiedLogsHandler :", error);
            throw error;
        }
    };
    assignStarterMobileHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqData = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("assign-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
            const starterBox = await findStarterByPcbOrStarterNumber(validatedReqData.pcb_number);
            if (!starterBox)
                throw new BadRequestException(STARTER_BOX_NOT_FOUND);
            // Reject duplicate names within the same request.
            const requestNames = validatedReqData.motors.map(m => m.motor_name.trim().toLocaleLowerCase());
            if (new Set(requestNames).size !== requestNames.length)
                throw new ConflictException(MOTOR_NAME_ALREADY_LOCATION);
            // Reject any name already used by another motor at this location.
            for (const lowerCaseTitle of requestNames) {
                const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["location_id", "alias_name", "status"], ["=", "LOWER", "!="], [validatedReqData.location_id, lowerCaseTitle, "ARCHIVED"]);
                if (existedMotor)
                    throw new ConflictException(MOTOR_NAME_ALREADY_LOCATION);
            }
            const motorCount = await getRecordsCount(motors, [eq(motors.starter_id, starterBox.id), ne(motors.status, "ARCHIVED")]);
            if (starterBox.device_status === "ASSIGNED" && motorCount > 0)
                throw new BadRequestException(STARTER_ALREADY_ASSIGNED);
            if (starterBox.device_status !== "DEPLOYED")
                throw new BadRequestException(STARTER_NOT_DEPLOYED);
            await db.transaction(async (trx) => {
                const { updatedStarter, updatedMotors } = await assignStarterWithTransaction(validatedReqData, userPayload, starterBox, trx);
                await ActivityService.writeStarterAssignedLog(c.get("performer_id"), starterBox.id, {
                    user_id: c.get("performer_id"),
                    location_id: updatedStarter.location_id,
                    motor_name: updatedMotors.map((m) => m.alias_name).filter(Boolean).join(", ")
                }, trx);
            });
            return sendResponse(c, 201, STARTER_ASSIGNED_SUCCESSFULLY, { starter_id: starterBox.id });
        }
        catch (error) {
            console.error("Error at assign starter :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    starterListWebHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const whereQueryData = starterFilters(query, userPayload);
            const starterList = await paginatedStarterList(whereQueryData, orderQueryData, paginationParams);
            return sendResponse(c, 200, STARTER_LIST_FETCHED, starterList);
        }
        catch (error) {
            console.error("Error at starter list for web :", error);
            throw error;
        }
    };
    starterListMobileHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type, "assigned_at", "desc");
            const whereQueryData = starterFilters(query, userPayload);
            const starterList = await paginatedStarterListForMobile(whereQueryData, orderQueryData, paginationParams);
            const records = await Promise.all(starterList.records.map(async (starter) => {
                if (starter.installation_photo_key) {
                    starter.installation_photo_url = await generateDownloadUrl(starter.installation_photo_key);
                }
                return starter;
            }));
            return sendResponse(c, 200, STARTER_LIST_FETCHED, { ...starterList, records });
        }
        catch (error) {
            console.error("Error at starter list for mobile :", error);
            throw error;
        }
    };
    deleteStarterBoxHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("id") ?? 0);
            const isUser = userPayload.user_type === "USER";
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            if (userPayload.user_type === "ADMIN" && starter.device_status !== "READY" && starter.device_status !== "TEST") {
                throw new UnauthorizedException("Unauthorized");
            }
            // EVERY live motor on the box, not just the first one. getSingleRecordByMultipleColumnValues
            // returns a single row, so deleting a dual-motor device archived one motor and left the
            // other alive pointing at a deleted box — which is why it kept appearing in the dashboard.
            const liveMotors = await db.select({ id: motors.id }).from(motors)
                .where(and(eq(motors.starter_id, starter.id), ne(motors.status, "ARCHIVED")));
            await db.transaction(async (trx) => {
                await updateRecordById(starterBoxes, starter.id, { status: "ARCHIVED" }, trx);
                await trx.update(starterDispatch).set({ status: "ARCHIVED" }).where(eq(starterDispatch.starter_id, starterId));
                if (liveMotors.length > 0) {
                    await trx.update(motors).set({ status: "ARCHIVED" })
                        .where(inArray(motors.id, liveMotors.map((m) => m.id)));
                }
                await ActivityService.logActivity({
                    performedBy: userPayload.id,
                    action: isUser ? "STARTER_REMOVED" : "DEVICE_DELETED",
                    entityType: "STARTER",
                    entityId: starterId,
                    newData: { pcb_number: starter.pcb_number },
                }, trx);
            });
            return sendResponse(c, 200, isUser ? STARTER_REMOVED_SUCCESS : STARTER_BOX_DELETED_SUCCESSFULLY);
        }
        catch (error) {
            console.error("Error at delete starter :", error);
            throw error;
        }
    };
    replaceStarterLocationHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(starterPayload);
            const validatedStarterReq = await validatedRequest("replace-starter", starterPayload, REPLACE_STARTER_BOX_VALIDATION_CRITERIA);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validatedStarterReq.starter_id, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [validatedStarterReq.motor_id, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const loweCaseLication = motor.alias_name?.trim().toLocaleLowerCase();
            let foundMotorName;
            if (loweCaseLication) {
                foundMotorName = await getSingleRecordByMultipleColumnValues(motors, ["alias_name", "location_id", "status"], ["LOWER", "=", "!="], [loweCaseLication, validatedStarterReq.location_id, "ARCHIVED"]);
            }
            if (foundMotorName)
                throw new ConflictException(MOTOR_NAME_ALREADY_LOCATION);
            await db.transaction(async (trx) => {
                const { updatedMotor, updatedStarter } = await replaceStarterWithTransaction(motor, starter, validatedStarterReq.location_id);
                await ActivityService.writeLocationReplacedLog(c.get("performer_id"), starter.id, { location_id: starter.location_id }, { location_id: updatedStarter.location_id, motor_id: updatedMotor.id }, trx);
            });
            return sendResponse(c, 201, STARTER_REPLACED_SUCCESSFULLY);
        }
        catch (error) {
            console.error("Error at replace starter :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at replace starter :", error);
            throw error;
        }
    };
    starterAnalyticsHandler = async (c) => {
        try {
            const query = c.req.query();
            const starterId = +(c.req.param("id") ?? 0);
            const motorId = +query.motor_id;
            paramsValidateException.validateId(starterId, "Device id");
            if (motorId)
                paramsValidateException.validateId(motorId, "Motor id");
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            if (motorId) {
                const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
                if (!motor)
                    throw new NotFoundException(MOTOR_NOT_FOUND);
            }
            const parameter = query.parameter;
            const { fromDateUTC, toDateUTC } = parseQueryDates(query);
            const starterList = await getStarterAnalytics(starterId, fromDateUTC, toDateUTC, parameter, motorId);
            return sendResponse(c, 200, DEVICE_ANALYTICS_FETCHED, starterList);
        }
        catch (error) {
            console.error("Error at starter analytics :", error);
            throw error;
        }
    };
    starterRunTimeHandler = async (c) => {
        try {
            const query = c.req.query();
            const starterId = +(c.req.param("id") ?? 0);
            const motorId = +query.motor_id;
            paramsValidateException.validateId(starterId, "Device id");
            if (motorId)
                paramsValidateException.validateId(motorId, "Motor id");
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            if (motorId) {
                const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
                if (!motor)
                    throw new NotFoundException(MOTOR_NOT_FOUND);
            }
            let powerState = query.power || "";
            let motorState = query.state || "";
            const hasFromDate = !!query.from_date;
            const hasToDate = !!query.to_date;
            const isSingleDate = (!hasFromDate || !hasToDate) || (hasFromDate && hasToDate && query.from_date === query.to_date);
            const { fromDateUTC, toDateUTC } = parseQueryDates(query);
            const starterList = query.parameter === "power"
                ? await getStarterRunTime(starterId, fromDateUTC, toDateUTC, motorId, powerState, isSingleDate)
                : await getMotorRunTime(starterId, fromDateUTC, toDateUTC, motorId, motorState, isSingleDate);
            return sendResponse(c, 200, STARTER_RUNTIME_FETCHED, starterList);
        }
        catch (error) {
            console.error("Error at device run time :", error);
            throw error;
        }
    };
    assignStarterWebHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqData = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("assign-starter-web", reqData, STARTER_BOX_VALIDATION_CRITERIA);
            const starterBox = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
            if (!starterBox)
                throw new BadRequestException(STARTER_BOX_NOT_FOUND);
            const user = await getSingleRecordByMultipleColumnValues(users, ["id", "status"], ["=", "!="], [userPayload.id, "ARCHIVED"]);
            if (!user)
                throw new BadRequestException(USER_NOT_FOUND);
            if (starterBox.device_status !== "DEPLOYED")
                throw new BadRequestException(STARTER_NOT_DEPLOYED);
            await db.transaction(async (trx) => {
                const { updatedStarter } = await assignStarterWebWithTransaction(starterBox, validatedReqData);
                await ActivityService.writeStarterAssignedLog(c.get("performer_id"), starterBox.id, { user_id: updatedStarter.user_id }, trx);
            });
            return sendResponse(c, 201, STARTER_ASSIGNED_SUCCESSFULLY);
        }
        catch (error) {
            console.error("Error at assign starter web :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at assign starter web :", error);
            throw error;
        }
    };
    updateDeployStatusHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqData = await c.req.json();
            const starterId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(starterId, "Device id");
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("update-deployed-status", reqData, STARTER_BOX_VALIDATION_CRITERIA);
            const starterBox = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["id", "device_status", "status", "device_allocation"]);
            if (!starterBox)
                throw new BadRequestException(STARTER_BOX_NOT_FOUND);
            const isTestToDeployed = starterBox.device_status === "TEST" && validatedReqData.deploy_status === "DEPLOYED";
            if (isTestToDeployed && starterBox.device_allocation === "false") {
                throw new BadRequestException(DEVICE_NOT_ALLOCATED);
            }
            const updateData = { device_status: validatedReqData.deploy_status };
            if (validatedReqData.deploy_status === "DEPLOYED") {
                updateData.deployed_at = new Date();
            }
            else if (validatedReqData.deploy_status === "ASSIGNED") {
                updateData.assigned_at = new Date();
            }
            await db.transaction(async (trx) => {
                await updateRecordByIdWithTrx(starterBoxes, starterBox.id, updateData, trx);
                await ActivityService.logActivity({
                    userId: c.get("performer_id"),
                    performedBy: c.get("performer_id"),
                    action: "DEPLOY_STATUS_UPDATE",
                    entityType: "STARTER",
                    entityId: starterBox.id,
                    oldData: { status: starterBox.device_status },
                    newData: { status: validatedReqData.deploy_status }
                }, trx);
            });
            return sendResponse(c, 201, DEPLOYED_STATUS_UPDATED);
        }
        catch (error) {
            console.error("Error at update device status :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at update device status :", error);
            throw error;
        }
    };
    starterConnectedMotorsHandler = async (c) => {
        try {
            const starterId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(starterId, "Device id");
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const connectedMotors = await starterConnectedMotors(starterId);
            if (connectedMotors?.installation_photo_key) {
                connectedMotors.installation_photo_url = await generateDownloadUrl(connectedMotors.installation_photo_key);
            }
            if (connectedMotors?.dispatch?.invoice_document) {
                connectedMotors.dispatch.invoice_document_url = await generateDownloadUrl(connectedMotors.dispatch.invoice_document);
            }
            return sendResponse(c, 200, STARTER_CONNECTED_MOTORS_FETCHED, connectedMotors);
        }
        catch (error) {
            console.error("Error at starter connected motors :", error);
            throw error;
        }
    };
    // Same payload as starterConnectedMotorsHandler (device + all its motors, M1/M2...),
    // but resolves the device by PCB / starter number instead of the numeric id.
    motorsByPcbNumberHandler = async (c) => {
        try {
            const pcbNumber = c.req.param("pcbNumber");
            if (!pcbNumber || !pcbNumber.trim())
                throw new BadRequestException(PCB_NUMBER_REQUIRED);
            const connectedMotors = await getStarterMotorsByPcb(pcbNumber);
            if (!connectedMotors)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            return sendResponse(c, 200, STARTER_CONNECTED_MOTORS_FETCHED, connectedMotors);
        }
        catch (error) {
            console.error("Error at motors by pcb number :", error);
            throw error;
        }
    };
    assignLocationToStarterHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqData = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("assign-location-to-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            await db.transaction(async (trx) => {
                const updatedStarter = await updateRecordById(starterBoxes, starter.id, { location_id: validatedReqData.location_id, user_id: userPayload.id }, trx);
                await ActivityService.logActivity({
                    performedBy: c.get("performer_id"),
                    action: "LOCATION_ASSIGNED",
                    entityType: "STARTER",
                    entityId: starter.id,
                    newData: { location_id: updatedStarter.location_id }
                }, trx);
            });
            return sendResponse(c, 201, LOCATION_ASSIGNED);
        }
        catch (error) {
            console.error("Error at assign location to starter :", error);
            handleJsonParseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at assign location to starter :", error);
            throw error;
        }
    };
    updateStarterDetailsHandler = async (c) => {
        try {
            const starterId = +(c.req.param("id") ?? 0);
            const reqData = await c.req.json();
            paramsValidateException.validateId(starterId, "Device id");
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("update-starter-details", reqData, STARTER_BOX_VALIDATION_CRITERIA);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            // Partial payload: write only the keys that actually arrived, so a field the screen
            // omits (or sends as null) keeps its stored value instead of being blanked.
            const starterUpdates = Object.fromEntries(Object.entries(validatedReqData).filter(([, value]) => value !== undefined && value !== null));
            // A dual-motor box has no 1.0 payload shape, so reject the pair whichever half of
            // it arrived in this request — the version, the motor count, or both.
            const nextVersion = payloadVersionOf({ payload_version: validatedReqData.payload_version ?? starter.payload_version });
            const nextDualMotor = isDualMotor({
                motor_support_type: validatedReqData.motor_support_type ?? starter.motor_support_type,
                starter_type: validatedReqData.starter_type ?? starter.starter_type,
            });
            if (isInvalidVersionMotorPair(nextVersion, nextDualMotor)) {
                throw new BadRequestException(PAYLOAD_VERSION_DUAL_MOTOR_INVALID);
            }
            const versionChanged = validatedReqData.payload_version != null
                && validatedReqData.payload_version !== starter.payload_version;
            // A version switch must preserve the motor configuration: 1.0 single -> 2.0 single,
            // never single -> dual in the same request. The two changes mean different things —
            // the version says what grammar the firmware speaks, the motor count says what
            // hardware is wired — and combining them republishes a box in a shape that was never
            // reviewed against either fact on its own. Change one, then the other.
            if (versionChanged) {
                const motorSupportChanged = validatedReqData.motor_support_type != null
                    && validatedReqData.motor_support_type !== starter.motor_support_type;
                const starterTypeChanged = validatedReqData.starter_type != null
                    && validatedReqData.starter_type !== starter.starter_type;
                if (motorSupportChanged || starterTypeChanged) {
                    throw new BadRequestException(PAYLOAD_VERSION_MOTOR_CHANGE_NOT_ALLOWED);
                }
            }
            // Changing the grammar means everything already on the device is in the old format.
            // Clear the synced flag so the next heartbeat republishes settings, and drop the
            // bounded-retry counter that would otherwise suppress that republish.
            if (versionChanged)
                starterUpdates.synced_settings_status = "false";
            const userId = c.get("user_payload").id;
            await db.transaction(async (trx) => {
                const updatedStarter = await updateRecordById(starterBoxes, starter.id, starterUpdates, trx);
                // Same rule for the dispatch row — these three were previously written
                // unconditionally, which blanked them whenever the payload omitted them.
                const dispatchUpdates = {};
                if (validatedReqData.pcb_number != null)
                    dispatchUpdates.pcb_number = validatedReqData.pcb_number;
                if (validatedReqData.starter_number != null)
                    dispatchUpdates.box_serial_no = validatedReqData.starter_number;
                if (validatedReqData.device_mobile_number != null)
                    dispatchUpdates.sim_no = validatedReqData.device_mobile_number;
                if (Object.keys(dispatchUpdates).length > 0) {
                    await updateRecordById(starterDispatch, starter.id, dispatchUpdates, trx);
                }
                await ActivityService.writeStarterUpdatedLog(userId, starterId, {
                    name: starter.name,
                    pcb_number: starter.pcb_number,
                    starter_number: starter.starter_number,
                    mac_address: starter.mac_address,
                    gateway_id: starter.gateway_id,
                    device_mobile_number: starter.device_mobile_number
                }, {
                    name: updatedStarter.name,
                    pcb_number: updatedStarter.pcb_number,
                    starter_number: updatedStarter.starter_number,
                    mac_address: updatedStarter.mac_address,
                    gateway_id: updatedStarter.gateway_id,
                    device_mobile_number: updatedStarter.device_mobile_number
                }, trx);
            });
            if (versionChanged) {
                // Settings: drop the bounded-retry counter so the next heartbeat actually
                // republishes instead of being suppressed as "already tried enough times".
                clearSettingsSyncAttempts(starter.id);
                // Schedules: whatever the device already stored is in the old grammar, so mark
                // this starter's still-pending schedules for resend. Scoped to PENDING/non-archived
                // rows, so past and cancelled schedules are not resurrected.
                await db.update(motorSchedules)
                    .set({ acknowledgement: 0, publish_attempts: 0 })
                    .where(and(eq(motorSchedules.starter_id, starter.id), eq(motorSchedules.schedule_status, "PENDING"), ne(motorSchedules.status, "ARCHIVED")));
                logger.info(`[payload-version] starter=${starter.id} switched ${starter.payload_version} -> ${validatedReqData.payload_version}; settings and schedules queued for resend`);
            }
            return sendResponse(c, 201, STARTER_DETAILS_UPDATED);
        }
        catch (error) {
            console.error("Error at update starter details :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at update starter details :", error);
            throw error;
        }
    };
    markStarterStatusHandler = async (c) => {
        try {
            const timeStamp = new Date(new Date().getTime() - 3 * 60 * 1000); // 3 minutes below
            const uniqueStarterData = await getUniqueStarterIdsWithInTime(timeStamp);
            await updateStarterStatusWithTransaction(uniqueStarterData);
            return sendResponse(c, 200, STARTER_BOX_STATUS_UPDATED);
        }
        catch (error) {
            console.error("Error at mark starter inactive:", error.message);
            throw error;
        }
    };
    getLatestPcbNumberHandler = async (c) => {
        try {
            const latestStarter = await db.select({
                id: starterBoxes.id,
                pcbNumber: starterBoxes.pcb_number,
            }).from(starterBoxes).where(and(isNotNull(starterBoxes.pcb_number))).orderBy(desc(starterBoxes.created_at)).limit(1);
            return sendResponse(c, 200, LATEST_PCB_NUMBER_FETCHED_SUCCESSFULLY, latestStarter);
        }
        catch (error) {
            console.error("Error at get latest PCB number :", error);
            throw error;
        }
    };
    getTemperatureHandler = async (c) => {
        try {
            const query = c.req.query();
            const starterId = +(c.req.param("id") ?? 0);
            const motor_id = +query.motor_id;
            paramsValidateException.validateId(starterId, "Device id");
            if (motor_id)
                paramsValidateException.validateId(motor_id, "Motor id");
            const { fromDateUTC, toDateUTC } = parseQueryDates(query);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const where = { columns: ["device_id"], relations: ["="], values: [starter.id] };
            if (motor_id) {
                where.columns.push("motor_id");
                where.relations.push("=");
                where.values.push(motor_id);
            }
            if (fromDateUTC) {
                where.columns.push("time_stamp");
                where.relations.push(">=");
                where.values.push(fromDateUTC);
            }
            if (toDateUTC) {
                where.columns.push("time_stamp");
                where.relations.push("<=");
                where.values.push(toDateUTC);
            }
            const orderBy = { columns: ["created_at"], values: ["asc"] };
            const columns = ["id", "device_id", "temperature", "time_stamp"];
            const temperature = await getRecordsConditionally(deviceTemperature, where, columns, orderBy);
            return sendResponse(c, 200, TEMPERATURE_FETCHED, temperature);
        }
        catch (error) {
            console.error("Error at get temperature :", error);
            throw error;
        }
    };
    updateDeviceAllocationHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("id") ?? 0);
            const { allocation_status: allocationStatus } = await c.req.json();
            paramsValidateException.validateId(starterId, "Device id");
            if (allocationStatus !== "true" && allocationStatus !== "false") {
                throw new BadRequestException("Invalid allocation status. It should be 'true' or 'false'.");
            }
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const currentCount = starter.allocation_status_count ?? 0;
            if (userPayload.user_type !== "SUPER_ADMIN" && allocationStatus === "true" && starter.device_allocation === "false" && currentCount >= 1) {
                throw new UnauthorizedException("Unauthorized");
            }
            await applyDeviceAllocation(starterId, allocationStatus, userPayload.id);
            return sendResponse(c, 200, "Device allocation status updated successfully");
        }
        catch (error) {
            console.error("Error at update device allocation status :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    updateSettingsSyncStatusHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("id") ?? 0);
            const body = await c.req.json();
            const syncStatus = body.synced_settings_status;
            paramsValidateException.validateId(starterId, "Device id");
            if (!syncStatus || (syncStatus !== "true" && syncStatus !== "false")) {
                throw new BadRequestException("Invalid sync status. It should be 'true' or 'false'.");
            }
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            await updateRecordById(starterBoxes, starterId, { synced_settings_status: syncStatus });
            // Re-arm the bounded heartbeat sync: without this, flipping the flag back to
            // "false" on a box whose attempts are already exhausted would never republish.
            clearSettingsSyncAttempts(starterId);
            await ActivityService.logActivity({
                performedBy: userPayload.id,
                action: "SETTINGS_SYNC_STATUS_OVERRIDE",
                entityType: "STARTER",
                entityId: starterId,
                oldData: { synced_settings_status: starter.synced_settings_status },
                newData: { synced_settings_status: syncStatus },
            });
            return sendResponse(c, 201, SETTINGS_SYNC_STATUS_UPDATED);
        }
        catch (error) {
            console.error("Error at update settings sync status :", error);
            throw error;
        }
    };
    starterCountBasedOnStatusHandler = async (c) => {
        try {
            const query = c.req.query();
            const baseFilters = starterCountFilters(query);
            const [totalDevices, activeCount, powerOnCount, powerOffCount, readyCount, testCount, deployedCount, assignedCount] = await Promise.all([
                getRecordsCount(starterBoxes, [...baseFilters]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.status, "ACTIVE")]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.power, 1)]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.power, 0)]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.device_status, "READY")]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.device_status, "TEST")]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.device_status, "DEPLOYED")]),
                getRecordsCount(starterBoxes, [...baseFilters, eq(starterBoxes.device_status, "ASSIGNED")]),
            ]);
            return sendResponse(c, 200, "Starter count fetched successfully", {
                total_devices: totalDevices,
                active_count: activeCount,
                power_on_count: powerOnCount,
                power_off_count: powerOffCount,
                ready_count: readyCount,
                test_count: testCount,
                deployed_count: deployedCount,
                assigned_count: assignedCount,
            });
        }
        catch (error) {
            logger.info("Error at starter count based on status :", error);
            console.error("Error at starter count based on status :", error);
            throw error;
        }
    };
    deviceResetHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(starterId, "Device id");
            const body = await c.req.json();
            const deviceResetStatus = body.device_reset_status;
            if (!deviceResetStatus || (deviceResetStatus !== "true" && deviceResetStatus !== "false")) {
                throw new BadRequestException("Invalid device reset status. It should be 'true' or 'false'.");
            }
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            await updateRecordById(starterBoxes, starterId, { device_reset_status: deviceResetStatus });
            await ActivityService.logActivity({
                performedBy: userPayload.id,
                action: "DEVICE_RESET_TRIGGERED",
                entityType: "STARTER",
                entityId: starterId,
                newData: { device_reset_status: deviceResetStatus, pcb_number: starter.pcb_number },
            });
            return sendResponse(c, 200, DEVICE_RESET_SUCCESSFULLY);
        }
        catch (error) {
            console.error("Error at device reset handler :", error);
            throw error;
        }
    };
    updateInstalledLocationHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(starterId, "Device id");
            const reqData = await c.req.json();
            const { device_installed_location } = await validatedRequest("update-installed-location", reqData, STARTER_BOX_VALIDATION_CRITERIA);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            await updateRecordById(starterBoxes, starterId, { device_installed_location });
            await ActivityService.logActivity({
                performedBy: userPayload.id,
                action: "DEVICE_INSTALLED_LOCATION_UPDATED",
                entityType: "STARTER",
                entityId: starterId,
                oldData: { device_installed_location: starter.device_installed_location },
                newData: { device_installed_location },
            });
            return sendResponse(c, 200, "Device installed location updated successfully");
        }
        catch (error) {
            console.error("Error at update installed location handler :", error);
            handleJsonParseError(error);
            throw error;
        }
    };
    getInstallationPhotoUploadUrlHandler = async (c) => {
        try {
            const starterId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(starterId, "Device id");
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const contentType = c.req.query("content_type") || "image/jpeg";
            const { uploadUrl, key } = await generateUploadUrl(starterId, contentType);
            await updateRecordById(starterBoxes, starterId, { installation_photo_key: key });
            return sendResponse(c, 200, "Upload URL generated successfully", { upload_url: uploadUrl, key });
        }
        catch (error) {
            console.error("Error at get installation photo upload url :", error);
            throw error;
        }
    };
    simRechargeExpiryNotificationHandler = async (c) => {
        try {
            const notificationsSent = await processSimRechargeExpiryNotifications();
            return sendResponse(c, 200, SIM_RECHARGE_EXPIRY_NOTIFICATIONS_SENT, { notifications_sent: notificationsSent });
        }
        catch (error) {
            console.error("Error at sim recharge expiry notification handler :", error);
            throw error;
        }
    };
    deviceInfoRequestHandler = async (c) => {
        try {
            const allDevices = await db.query.starterBoxes.findMany({
                where: ne(starterBoxes.status, "ARCHIVED"),
            });
            const BATCH_SIZE = 10;
            const BATCH_DELAY_MS = 60 * 1000; // 1 minute between batches
            // Fire-and-forget: process batches in background
            (async () => {
                for (let i = 0; i < allDevices.length; i += BATCH_SIZE) {
                    const batch = allDevices.slice(i, i + BATCH_SIZE);
                    for (const device of batch) {
                        const deviceInfoPayload = { T: requestTypesFor(payloadVersionOf(device)).DEVICE_INFO_REQUEST, S: randomSequenceNumber(), D: 1 };
                        publishMultipleTimesInBackground(deviceInfoPayload, device);
                    }
                    logger.info(`Device info request: batch ${Math.floor(i / BATCH_SIZE) + 1} sent (${batch.length} devices)`);
                    // Wait 1 minute before next batch (skip delay after last batch)
                    if (i + BATCH_SIZE < allDevices.length) {
                        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                    }
                }
                logger.info(`Device info request: all ${allDevices.length} devices processed`);
            })();
            const totalBatches = Math.ceil(allDevices.length / BATCH_SIZE);
            return sendResponse(c, 200, "Device info request sended", {
                total_devices: allDevices.length,
                batch_size: BATCH_SIZE,
                total_batches: totalBatches,
                estimated_time_minutes: totalBatches - 1,
            });
        }
        catch (error) {
            console.error("Error at device info request handler :", error);
            throw error;
        }
    };
    faultClearedHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("starter_id") ?? 0);
            const motorId = +(c.req.param("motor_id") ?? 0);
            paramsValidateException.validateId(starterId, "Device id");
            paramsValidateException.validateId(motorId, "Motor id");
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const orderBy = { columns: ["id"], values: ["desc"] };
            const faultRecord = await getSingleRecordByMultipleColumnValues(starterBoxParameters, ["starter_id", "motor_id", "fault", "fault_cleared"], ["=", "=", "!=", "="], [starterId, motorId, 0, false], ["id"], orderBy);
            if (!faultRecord)
                throw new NotFoundException(NO_ACTIVE_FAULT_FOUND);
            await updateRecordById(starterBoxParameters, faultRecord.id, { fault_cleared: true });
            await ActivityService.logActivity({
                performedBy: userPayload.id,
                action: "FAULT_MANUALLY_CLEARED",
                entityType: "STARTER",
                entityId: starterId,
                newData: { motor_id: motorId, fault_record_id: faultRecord.id, motor_name: motor.alias_name ?? motor.name },
            });
            return sendResponse(c, 200, FAULT_CLEARED_SUCCESSFULLY);
        }
        catch (error) {
            console.error("Error at fault cleared handler :", error);
            throw error;
        }
    };
    getDeviceDetailsHandler = async (c) => {
        try {
            const body = await c.req.json();
            const deviceDetails = await getDeviceWithDispatchDetails(body.search);
            if (!deviceDetails) {
                throw new NotFoundException(DEVICE_NOT_FOUND);
            }
            return sendResponse(c, 200, "Device details fetched successfully", deviceDetails);
        }
        catch (error) {
            console.error("Error at get device details handler:", error);
            throw error;
        }
    };
    getBasicDetailsHandler = async (c) => {
        try {
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const search = query.search_string ?? query.search ?? "";
            const basicDetails = await getBasicStarterDetails(paginationParams, search);
            return sendResponse(c, 200, "Basic device details fetched successfully", basicDetails);
        }
        catch (error) {
            console.error("Error at get basic device details handler:", error);
            throw error;
        }
    };
}
