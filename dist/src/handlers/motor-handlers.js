import { MOTOR_ADDED, MOTOR_CONTROL_COMMAND_SENT, MOTOR_CONTROL_MOTORS_NOT_FOUND, MOTOR_CONTROL_MULTIPLE_NOT_SUPPORTED, MOTOR_CONTROL_VALIDATION_CRITERIA, MOTOR_DELETED, MOTOR_DETAILS_FETCHED, MOTOR_MODE_CONTROL_COMMAND_SENT, MOTOR_MODE_CONTROL_VALIDATION_CRITERIA, MOTOR_NAME_EXISTED, MOTOR_NOT_FOUND, MOTOR_TEST_RUN_STATUS_UPDATED, MOTOR_UPDATED, MOTOR_VALIDATION_CRITERIA, STARTER_BOX_NOT_FOUND } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { motorFilters } from "../helpers/motor-helper.js";
import { getModeControlStatusDescription, getMotorControlStatusDescription } from "../helpers/packet-types-helper.js";
import { motorKey } from "../helpers/motor-control-payload-helper.js";
import { sendMotorControlCommand } from "../helpers/motor-control-sync-helper.js";
import { sendModeControlCommand } from "../helpers/mode-control-sync-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getMotorsByIdsForStarter, getMotorsLatestRuntime, getMotorsTotalRunOnTime, paginatedMotorsList } from "../services/db/motor-services.js";
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
                    await ActivityService.writeMotorAddedLog(c.get("performer_id"), motor.id, {
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
            const motorId = +(c.req.param("id") ?? 0);
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("update-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["location_id", "alias_name", "id", "status"], ["=", "=", "!=", "!="], [motor.location_id, validMotorReq.name, motor.id, "ARCHIVED"]);
            if (existedMotor)
                throw new ConflictException(MOTOR_NAME_EXISTED);
            const device = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [motor.starter_id, "ARCHIVED"]);
            const notificationData = await db.transaction(async (trx) => {
                const updatePayload = { alias_name: validMotorReq.name, hp: validMotorReq.hp.toString() };
                if (validMotorReq.state !== undefined)
                    updatePayload.state = validMotorReq.state;
                if (validMotorReq.mode !== undefined)
                    updatePayload.mode = validMotorReq.mode;
                const updatedMotor = await updateRecordById(motors, motorId, updatePayload, trx);
                await ActivityService.writeMotorUpdatedLog(c.get("performer_id"), motorId, { name: motor.alias_name, hp: motor.hp, state: motor.state, mode: motor.mode }, { name: updatedMotor.alias_name, hp: updatedMotor.hp, state: updatedMotor.state, mode: updatedMotor.mode }, trx, motor.starter_id || undefined);
                const starterId = motor.starter_id || 0;
                const hasStateChanged = updatedMotor.state !== undefined && updatedMotor.state !== motor.state;
                const hasModeChanged = updatedMotor.mode !== undefined && updatedMotor.mode !== motor.mode;
                const mode = updatedMotor.mode || motor.mode || "";
                const starterNumber = device ? device.starter_number : "";
                const notificationDataState = hasStateChanged ? prepareMotorStateControlNotificationData(motor, updatedMotor.state, mode, starterId, starterNumber) : null;
                const notificationDataMode = hasModeChanged ? prepareMotorModeControlNotificationData(motor, updatedMotor.mode, starterId, starterNumber) : null;
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
    // Turns one or more motors on a starter box ON/OFF via MQTT (T:1) and waits for
    // the device's ACK (T:31). A single-motor request is just a 1-element `motors`
    // array — this is the one code path for both single and multi-motor control.
    controlMotorsHandler = async (c) => {
        try {
            const starterId = +(c.req.param("starterId") ?? 0);
            paramsValidateException.validateId(starterId, "starter id");
            const requestBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(requestBody);
            const validReq = await validatedRequest("control-motors", requestBody, MOTOR_CONTROL_VALIDATION_CRITERIA);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const requestedByMotorId = new Map(validReq.motors.map(m => [m.motor_id, m.state]));
            const uniqueMotorIds = [...requestedByMotorId.keys()];
            if (starter.motor_support_type === "SINGLE_MOTOR" && uniqueMotorIds.length > 1) {
                throw new BadRequestException(MOTOR_CONTROL_MULTIPLE_NOT_SUPPORTED);
            }
            const motorsFound = await getMotorsByIdsForStarter(starterId, uniqueMotorIds);
            if (motorsFound.length !== uniqueMotorIds.length) {
                throw new BadRequestException(MOTOR_CONTROL_MOTORS_NOT_FOUND);
            }
            const targets = motorsFound.map(m => ({
                motor_index: m.motor_index ?? 1,
                state: requestedByMotorId.get(m.id),
            }));
            const ackResult = await sendMotorControlCommand(starter, targets);
            const results = motorsFound.map(m => {
                const idx = m.motor_index ?? 1;
                const ackCode = ackResult.data?.[motorKey(idx)];
                return {
                    motor_id: m.id,
                    motor_index: idx,
                    requested_state: requestedByMotorId.get(m.id),
                    acked: ackCode !== undefined,
                    ack_code: ackCode ?? null,
                    ack_status: ackCode !== undefined ? getMotorControlStatusDescription(ackCode) : null,
                };
            });
            const status = !ackResult.acked
                ? "TIMEOUT"
                : results.every(r => r.acked)
                    ? "ACKED"
                    : "PARTIAL_ACK";
            return sendResponse(c, 200, MOTOR_CONTROL_COMMAND_SENT, { status, results });
        }
        catch (error) {
            console.error("Error at control motors :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            throw error;
        }
    };
    // Switches one or more motors on a starter box between MANUAL/AUTO via MQTT (T:2)
    // and waits for the device's ACK (T:32). Same single/multi shape as controlMotorsHandler.
    controlMotorsModeHandler = async (c) => {
        try {
            const starterId = +(c.req.param("starterId") ?? 0);
            paramsValidateException.validateId(starterId, "starter id");
            const requestBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(requestBody);
            const validReq = await validatedRequest("control-motors-mode", requestBody, MOTOR_MODE_CONTROL_VALIDATION_CRITERIA);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const requestedByMotorId = new Map(validReq.motors.map(m => [m.motor_id, m.mode]));
            const uniqueMotorIds = [...requestedByMotorId.keys()];
            if (starter.motor_support_type === "SINGLE_MOTOR" && uniqueMotorIds.length > 1) {
                throw new BadRequestException(MOTOR_CONTROL_MULTIPLE_NOT_SUPPORTED);
            }
            const motorsFound = await getMotorsByIdsForStarter(starterId, uniqueMotorIds);
            if (motorsFound.length !== uniqueMotorIds.length) {
                throw new BadRequestException(MOTOR_CONTROL_MOTORS_NOT_FOUND);
            }
            const targets = motorsFound.map(m => ({
                motor_index: m.motor_index ?? 1,
                mode: requestedByMotorId.get(m.id),
            }));
            const ackResult = await sendModeControlCommand(starter, targets);
            const results = motorsFound.map(m => {
                const idx = m.motor_index ?? 1;
                const ackCode = ackResult.data?.[motorKey(idx)];
                return {
                    motor_id: m.id,
                    motor_index: idx,
                    requested_mode: requestedByMotorId.get(m.id),
                    acked: ackCode !== undefined,
                    ack_code: ackCode ?? null,
                    ack_status: ackCode !== undefined ? getModeControlStatusDescription(ackCode) : null,
                };
            });
            const status = !ackResult.acked
                ? "TIMEOUT"
                : results.every(r => r.acked)
                    ? "ACKED"
                    : "PARTIAL_ACK";
            return sendResponse(c, 200, MOTOR_MODE_CONTROL_COMMAND_SENT, { status, results });
        }
        catch (error) {
            console.error("Error at control motors mode :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            throw error;
        }
    };
    getSingleMotorHandler = async (c) => {
        try {
            const motorId = +(c.req.param("id") ?? 0);
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
            const motorId = +(c.req.param("id") ?? 0);
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
                await ActivityService.writeMotorDeletedLog(c.get("performer_id"), motor.id, trx, motor.starter_id || undefined);
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
            const motorsData = await paginatedMotorsList(whereQueryData, orderQueryData, paginationParams);
            const motorIds = motorsData.records.map((m) => m.id).filter(Boolean);
            const latestRuntimeMap = await getMotorsLatestRuntime(motorIds);
            const records = motorsData.records.map((motor) => ({
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
        }
        catch (error) {
            console.error("Error at get all motors :", error);
            throw error;
        }
    };
    updateMotorTestRunStatusHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(motorId, "motor id");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("update-motor-test-run-status", motorPayload, MOTOR_VALIDATION_CRITERIA);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            await db.transaction(async (trx) => {
                await updateRecordById(motors, motor.id, { test_run_status: validMotorReq.test_run_status, test_run_completed_at: new Date() }, trx);
                await ActivityService.writeMotorTestRunStatusUpdatedLog(c.get("performer_id"), motor.id, motor.test_run_status, validMotorReq.test_run_status, trx, motor.starter_id || undefined);
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
