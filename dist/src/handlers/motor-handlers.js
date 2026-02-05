import { MOTOR_ADDED, MOTOR_DELETED, MOTOR_DETAILS_FETCHED, MOTOR_NAME_EXISTED, MOTOR_NOT_FOUND, MOTOR_TEST_RUN_STATUS_UPDATED, MOTOR_UPDATED, MOTOR_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import ConflictException from "../exceptions/conflict-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { motorFilters } from "../helpers/motor-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { paginatedMotorsList } from "../services/db/motor-services.js";
import { getMotorWithStarterDetails } from "../services/db/motor-starter-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import { ActivityService } from "../services/db/activity-service.js";
import { prepareMotorStateControlNotificationData, prepareMotorModeControlNotificationData } from "../helpers/motor-helper.js";
import { sendUserNotification } from "../services/fcm/fcm-service.js";
const paramsValidateException = new ParamsValidateException();
export class MotorHandlers {
    addMotorHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            const preparedMotorPayload = {
                name: validMotorReq.name,
                alias_name: validMotorReq.name,
                created_by: userPayload.id,
                location_id: validMotorReq.location_id,
                hp: validMotorReq.hp.toString(),
            };
            await db.transaction(async (trx) => {
                const motor = await saveSingleRecord(motors, preparedMotorPayload, trx);
                if (motor) {
                    await ActivityService.writeMotorAddedLog(userPayload.id, motor.id, {
                        name: motor.alias_name,
                        hp: motor.hp,
                        location_id: motor.location_id
                    }, trx);
                }
            });
            return sendResponse(c, 201, MOTOR_ADDED);
        }
        catch (error) {
            console.error("Error at add motor :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at add motor :", error);
            throw error;
        }
    };
    updateMotorHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +c.req.param("id");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("update-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["location_id", "alias_name", "id", "status"], ["=", "=", "!=", "!="], [motor.location_id, validMotorReq.name, motor.id, "ARCHIVED"]);
            if (existedMotor)
                throw new ConflictException(MOTOR_NAME_EXISTED);
            const notificationData = await db.transaction(async (trx) => {
                const updatePayload = { alias_name: validMotorReq.name, hp: validMotorReq.hp.toString() };
                if (validMotorReq.state !== undefined)
                    updatePayload.state = validMotorReq.state;
                if (validMotorReq.mode !== undefined)
                    updatePayload.mode = validMotorReq.mode;
                const updatedMotor = await updateRecordById(motors, motorId, updatePayload, trx);
                await ActivityService.writeMotorUpdatedLog(userPayload.id, motorId, { name: motor.alias_name, hp: motor.hp, state: motor.state, mode: motor.mode }, { name: updatedMotor.alias_name, hp: updatedMotor.hp, state: updatedMotor.state, mode: updatedMotor.mode }, trx, motor.starter_id || undefined);
                const starterId = motor.starter_id || 0;
                const hasStateChanged = updatedMotor.state !== undefined && updatedMotor.state !== motor.state;
                const hasModeChanged = updatedMotor.mode !== undefined && updatedMotor.mode !== motor.mode;
                const mode = updatedMotor.mode || motor.mode || "";
                const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, updatedMotor.state, mode, starterId) : null;
                const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, updatedMotor.mode, starterId) : null;
                return { notificationDataState, notificationDataMode };
            });
            if (notificationData.notificationDataState) {
                await sendUserNotification(notificationData.notificationDataState.userId, notificationData.notificationDataState.title, notificationData.notificationDataState.message, notificationData.notificationDataState.motorId, notificationData.notificationDataState.starterId);
            }
            if (notificationData.notificationDataMode) {
                await sendUserNotification(notificationData.notificationDataMode.userId, notificationData.notificationDataMode.title, notificationData.notificationDataMode.message, notificationData.notificationDataMode.motorId, notificationData.notificationDataMode.starterId);
            }
            return sendResponse(c, 200, MOTOR_UPDATED);
        }
        catch (error) {
            console.error("Error at update motor :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at update motor :", error);
            throw error;
        }
    };
    getSingleMotorHandler = async (c) => {
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
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], [...motorColumns]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const motorWithStarterDetails = await getMotorWithStarterDetails(motor.id);
            return sendResponse(c, 200, MOTOR_DETAILS_FETCHED, motorWithStarterDetails);
        }
        catch (error) {
            console.error("Error at get single motor :", error);
            throw error;
        }
    };
    deleteMotorHandler = async (c) => {
        try {
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const userPayload = c.get("user_payload");
            await db.transaction(async (trx) => {
                await updateRecordById(motors, motor.id, { status: "ARCHIVED" }, trx);
                if (motor.starter_id) {
                    await updateRecordById(starterBoxes, motor.starter_id, { device_status: "DEPLOYED", user_id: null }, trx);
                }
                await ActivityService.writeMotorDeletedLog(userPayload.id, motor.id, trx, motor.starter_id || undefined);
            });
            return sendResponse(c, 200, MOTOR_DELETED);
        }
        catch (error) {
            console.error("Error at delete motor :", error);
            throw error;
        }
    };
    getAllMotorsHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type, "assigned_at", "desc");
            const whereQueryData = motorFilters(query, userPayload);
            const motors = await paginatedMotorsList(whereQueryData, orderQueryData, paginationParams);
            return sendResponse(c, 200, MOTOR_DETAILS_FETCHED, motors);
        }
        catch (error) {
            console.error("Error at get all motors :", error);
            throw error;
        }
    };
    updateMotorTestRunStatusHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("update-motor-test-run-status", motorPayload, MOTOR_VALIDATION_CRITERIA);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            await db.transaction(async (trx) => {
                await updateRecordById(motors, motor.id, { test_run_status: validMotorReq.test_run_status }, trx);
                await ActivityService.writeMotorTestRunStatusUpdatedLog(userPayload.id, motor.id, motor.test_run_status, validMotorReq.test_run_status, trx, motor.starter_id || undefined);
            });
            return sendResponse(c, 200, MOTOR_TEST_RUN_STATUS_UPDATED);
        }
        catch (error) {
            console.error("Error at update motor test run status:", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
}
