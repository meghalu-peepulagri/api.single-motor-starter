import { and, eq, ne } from "drizzle-orm";
import { MOTOR_ADDED, MOTOR_ALREADY_ASSIGNED, MOTOR_ASSIGN_VALIDATION_CRITERIA, MOTOR_ASSIGNED_TO_DEVICE, MOTOR_DELETED, MOTOR_DETACHED_FROM_DEVICE, MOTOR_DETAILS_FETCHED, MOTOR_NAME_EXISTED, MOTOR_NOT_ASSIGNED_TO_DEVICE, MOTOR_NOT_FOUND, MOTOR_REPLACE_VALIDATION_CRITERIA, MOTOR_REPLACED, MOTOR_REPLACED_DEVICE, MOTOR_SAME_DEVICE, MOTOR_TEST_RUN_STATUS_UPDATED, MOTOR_UPDATED, MOTOR_USER_ASSIGNED, MOTOR_VALIDATION_CRITERIA, STARTER_BOX_NOT_FOUND, STARTER_NOT_DEPLOYED, USER_NOT_FOUND } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { users } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { motorFilters, prepareNewMotorPayload, prepareReplacementMotorPayload } from "../helpers/motor-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getMotorsLatestRuntime, getMotorsTotalRunOnTime, paginatedMotorsList } from "../services/db/motor-services.js";
import { getMotorWithStarterDetails } from "../services/db/motor-starter-services.js";
import { checkDeviceMotorCapacity, resolveMotorSlot } from "../helpers/motor-device-helper.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import { ActivityService } from "../services/db/activity-service.js";
import { prepareMotorStateControlNotificationData, prepareMotorModeControlNotificationData } from "../helpers/motor-helper.js";
import { sendUserNotification } from "../services/fcm/fcm-service.js";
import { activityDeviceLabel as deviceLabel, activityMotorLabel as motorLabel } from "../helpers/activity-helper.js";
const paramsValidateException = new ParamsValidateException();
export class MotorHandlers {
    addMotorHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            let starterAssignment = null;
            let starterLocationId = null;
            if (validMotorReq.starter_id) {
                const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validMotorReq.starter_id, "ARCHIVED"]);
                if (!starter)
                    throw new NotFoundException(STARTER_BOX_NOT_FOUND);
                if (starter.device_status !== "DEPLOYED" && starter.device_status !== "ASSIGNED")
                    throw new BadRequestException(STARTER_NOT_DEPLOYED);
                await checkDeviceMotorCapacity(starter);
                const { motorReference, motorIndex } = await resolveMotorSlot(starter, validMotorReq.motor_reference);
                starterAssignment = { starter_id: starter.id, motor_reference: motorReference, motor_index: motorIndex };
                starterLocationId = starter.location_id ?? null;
            }
            // created_by = who performed this action (never changes after creation)
            // user_id    = which customer owns this motor (follows device ownership)
            const userId = validMotorReq.user_id ?? null;
            const preparedMotorPayload = prepareNewMotorPayload({
                name: validMotorReq.name,
                hp: validMotorReq.hp,
                locationId: validMotorReq.location_id ?? starterLocationId,
                createdBy: userPayload.id,
                userId,
                starterAssignment,
            });
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
            const device = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [motor.starter_id, "ARCHIVED"]);
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
            const isAdmin = userPayload.user_type === "ADMIN" || userPayload.user_type === "SUPER_ADMIN";
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type, isAdmin ? "created_at" : "assigned_at", "desc");
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
    assignMotorToDeviceHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const reqData = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("assign-motor-to-device", reqData, MOTOR_ASSIGN_VALIDATION_CRITERIA);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validatedReqData.starter_id, "ARCHIVED"]);
            if (!starter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            if (starter.device_status !== "DEPLOYED" && starter.device_status !== "ASSIGNED")
                throw new BadRequestException(STARTER_NOT_DEPLOYED);
            // When reassigning from the same device, exclude this motor from capacity/slot counts
            const isSameDevice = motor.starter_id === starter.id;
            const excludeMotorId = isSameDevice ? motor.id : undefined;
            await checkDeviceMotorCapacity(starter, excludeMotorId);
            const { motorReference, motorIndex } = await resolveMotorSlot(starter, validatedReqData.motor_reference, excludeMotorId);
            // If the new device belongs to a different user, the motor follows that user
            const ownerChanged = starter.user_id != null && starter.user_id !== motor.user_id;
            // If the device has no user yet but the motor does, the device inherits the motor's user
            const deviceShouldInheritUser = starter.user_id == null && motor.user_id != null;
            // Fetch old device label for move message (before transaction)
            const isMove = motor.starter_id != null && motor.starter_id !== starter.id;
            let oldDeviceLabel = "";
            if (isMove) {
                const oldStarter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id"], ["="], [motor.starter_id], ["id", "pcb_number", "starter_number"]);
                oldDeviceLabel = oldStarter ? deviceLabel(oldStarter.pcb_number, oldStarter.starter_number) : `device "${motor.starter_id}"`;
            }
            const newDeviceLabel = deviceLabel(starter.pcb_number, starter.starter_number);
            const mLabel = motorLabel(motor.alias_name);
            const assignMessage = isSameDevice
                ? `${mLabel} slot changed from ${motor.motor_reference ?? "-"} to ${motorReference} on ${newDeviceLabel}`
                : isMove
                    ? `${mLabel} moved from ${oldDeviceLabel} to ${newDeviceLabel}`
                    : `${mLabel} assigned to ${newDeviceLabel}`;
            await db.transaction(async (trx) => {
                await updateRecordById(motors, motorId, {
                    starter_id: starter.id,
                    assigned_at: new Date(),
                    motor_reference: motorReference,
                    motor_index: motorIndex,
                    ...(ownerChanged && { user_id: starter.user_id }),
                    ...(starter.location_id != null && { location_id: starter.location_id }),
                }, trx);
                const starterUpdatePayload = {};
                if (deviceShouldInheritUser)
                    starterUpdatePayload.user_id = motor.user_id;
                if (starter.location_id == null && motor.location_id != null)
                    starterUpdatePayload.location_id = motor.location_id;
                if (Object.keys(starterUpdatePayload).length > 0) {
                    await updateRecordById(starterBoxes, starter.id, starterUpdatePayload, trx);
                }
                await ActivityService.logActivity({
                    performedBy: userPayload.id,
                    action: "MOTOR_ASSIGNED",
                    entityType: "MOTOR",
                    entityId: motorId,
                    deviceId: starter.id,
                    oldData: {
                        starter_id: motor.starter_id,
                        motor_reference: motor.motor_reference,
                        user_id: motor.user_id,
                        device_user_id: starter.user_id,
                    },
                    newData: {
                        starter_id: starter.id,
                        motor_reference: motorReference,
                        motor_index: motorIndex,
                        ...(ownerChanged && { user_id: starter.user_id }),
                        ...(deviceShouldInheritUser && { device_user_id: motor.user_id }),
                    },
                    message: assignMessage,
                }, trx);
            });
            return sendResponse(c, 200, MOTOR_ASSIGNED_TO_DEVICE);
        }
        catch (error) {
            console.error("Error at assign motor to device:", error);
            handleJsonParseError(error);
            handleForeignKeyViolationError(error);
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
                await updateRecordById(motors, motor.id, { test_run_status: validMotorReq.test_run_status, test_run_completed_at: new Date() }, trx);
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
    replaceMotorDeviceHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const reqData = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqData);
            const validatedReqData = await validatedRequest("replace-motor-device", reqData, MOTOR_REPLACE_VALIDATION_CRITERIA);
            // Case 1: Motor must exist and not be archived
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            // Case 2: Motor must be assigned to a starter to be replaceable
            if (!motor.starter_id)
                throw new BadRequestException(MOTOR_NOT_ASSIGNED_TO_DEVICE);
            const replaceDevice = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id"], ["="], [motor.starter_id], ["id", "pcb_number", "starter_number"]);
            const replaceDeviceLabel = replaceDevice ? deviceLabel(replaceDevice.pcb_number, replaceDevice.starter_number) : `device "${motor.starter_id}"`;
            const isAdminReplace = userPayload.user_type === "ADMIN" || userPayload.user_type === "SUPER_ADMIN";
            const newMotorPayload = prepareReplacementMotorPayload({
                name: validatedReqData.name,
                hp: validatedReqData.hp,
                locationId: validatedReqData.location_id,
                createdBy: isAdminReplace ? null : userPayload.id,
                existingMotor: {
                    starter_id: motor.starter_id,
                    motor_reference: motor.motor_reference,
                    motor_index: motor.motor_index,
                },
            });
            await db.transaction(async (trx) => {
                // Step 1: Archive the old motor and release its slot
                await updateRecordById(motors, motorId, {
                    status: "ARCHIVED",
                    starter_id: null,
                    motor_reference: null,
                    motor_index: null,
                }, trx);
                // Step 2: Create the new motor in the same slot
                const newMotor = await saveSingleRecord(motors, newMotorPayload, trx);
                const oldMLabel = motorLabel(motor.alias_name);
                const newMLabel = newMotor.alias_name ? `'${newMotor.alias_name}'` : null;
                const replacedMsg = newMLabel
                    ? `${oldMLabel} replaced by ${newMLabel} on ${replaceDeviceLabel}`
                    : `${oldMLabel} replaced on ${replaceDeviceLabel}`;
                // Log 1: old motor replaced (archived)
                await ActivityService.logActivity({
                    performedBy: userPayload.id,
                    action: "MOTOR_REPLACED",
                    entityType: "MOTOR",
                    entityId: motorId,
                    deviceId: motor.starter_id ?? undefined,
                    oldData: {
                        motor_id: motorId,
                        name: motor.alias_name,
                        hp: motor.hp,
                        motor_reference: motor.motor_reference,
                        motor_index: motor.motor_index,
                        starter_id: motor.starter_id,
                    },
                    newData: {
                        motor_id: newMotor.id,
                        name: newMotor.alias_name,
                        hp: newMotor.hp,
                        motor_reference: newMotor.motor_reference,
                        motor_index: newMotor.motor_index,
                        starter_id: newMotor.starter_id,
                    },
                    message: replacedMsg,
                }, trx);
                // Log 2: new motor added
                const addedMsg = newMotor.alias_name
                    ? `Motor '${newMotor.alias_name}' added to ${replaceDeviceLabel}`
                    : `Motor added to ${replaceDeviceLabel}`;
                await ActivityService.writeMotorAddedLog(userPayload.id, newMotor.id, {
                    name: newMotor.alias_name,
                    hp: newMotor.hp,
                    location_id: newMotor.location_id,
                }, trx, addedMsg);
            });
            return sendResponse(c, 200, MOTOR_REPLACED);
        }
        catch (error) {
            console.error("Error at replace motor device:", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    assignUserToMotorHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const { user_id } = await c.req.json();
            if (!user_id || typeof user_id !== "number")
                throw new BadRequestException("user_id is required and must be a number");
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            const user = await getSingleRecordByMultipleColumnValues(users, ["id", "status"], ["=", "!="], [user_id, "ARCHIVED"]);
            if (!user)
                throw new NotFoundException(USER_NOT_FOUND);
            await db.transaction(async (trx) => {
                if (motor.starter_id) {
                    // Update ALL motors on this device (handles 2-motor devices)
                    await trx.update(motors)
                        .set({ user_id })
                        .where(and(eq(motors.starter_id, motor.starter_id), ne(motors.status, "ARCHIVED")));
                    await updateRecordById(starterBoxes, motor.starter_id, { user_id }, trx);
                }
                else {
                    await updateRecordById(motors, motorId, { user_id }, trx);
                }
                await ActivityService.logActivity({
                    performedBy: userPayload.id,
                    action: "MOTOR_USER_ASSIGNED",
                    entityType: "MOTOR",
                    entityId: motorId,
                    deviceId: motor.starter_id ?? undefined,
                    oldData: { user_id: motor.user_id },
                    newData: { user_id },
                }, trx);
            });
            return sendResponse(c, 200, MOTOR_USER_ASSIGNED);
        }
        catch (error) {
            console.error("Error at assign user to motor:", error);
            handleJsonParseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    detachMotorFromDeviceHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            if (!motor.starter_id)
                throw new BadRequestException(MOTOR_NOT_ASSIGNED_TO_DEVICE);
            const previousStarterId = motor.starter_id;
            const prevStarter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id"], ["="], [previousStarterId], ["id", "pcb_number", "starter_number"]);
            const detachDeviceLabel = prevStarter ? deviceLabel(prevStarter.pcb_number, prevStarter.starter_number) : `device "${previousStarterId}"`;
            const detachMessage = `${motorLabel(motor.alias_name)} detached from ${detachDeviceLabel}`;
            await db.transaction(async (trx) => {
                await updateRecordById(motors, motorId, {
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
                    oldData: { starter_id: previousStarterId, motor_reference: motor.motor_reference, motor_index: motor.motor_index },
                    message: detachMessage,
                }, trx);
            });
            return sendResponse(c, 200, MOTOR_DETACHED_FROM_DEVICE);
        }
        catch (error) {
            console.error("Error at detach motor from device:", error);
            handleJsonParseError(error);
            throw error;
        }
    };
}
