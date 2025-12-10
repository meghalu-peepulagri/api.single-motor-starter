import { MOTOR_ADDED, MOTOR_DELETED, MOTOR_DETAILS_FETCHED, MOTOR_NOT_FOUND, MOTOR_UPDATED, MOTOR_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { motors } from "../database/schemas/motors.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class MotorHandlers {
    addMotor = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            // const field = await getSingleRecordByMultipleColumnValues<FieldsTable>(fields, ["id", "status"], ["=", "!="], [validMotorReq.field_id, "ARCHIVED"]);
            // if (!field) throw new NotFoundException(FIELD_NOT_FOUND);
            const preparedMotorPayload = {
                name: validMotorReq.name, created_by: userPayload.id, location_id: validMotorReq.location_id,
                hp: validMotorReq.hp.toString(),
            };
            await saveSingleRecord(motors, preparedMotorPayload);
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
    updateMotor = async (c) => {
        try {
            const motorId = +c.req.param("id");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("update-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            await updateRecordById(motors, motorId, { ...validMotorReq, hp: validMotorReq.hp.toString() });
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
    getSingleMotor = async (c) => {
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
            return sendResponse(c, 200, MOTOR_DETAILS_FETCHED, motor);
        }
        catch (error) {
            console.error("Error at get single motor :", error);
            throw error;
        }
    };
    deleteMotor = async (c) => {
        try {
            const motorId = +c.req.param("id");
            paramsValidateException.validateId(motorId, "motor id");
            const motor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]);
            if (!motor)
                throw new NotFoundException(MOTOR_NOT_FOUND);
            await updateRecordById(motors, motorId, { status: "ARCHIVED" });
            return sendResponse(c, 200, MOTOR_DELETED);
        }
        catch (error) {
            console.error("Error at delete motor :", error);
            throw error;
        }
    };
}
