import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { validatedRequest } from "../validations/validate-request.js";
import { MOTOR_ADDED, MOTOR_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { saveSingleRecord } from "../services/db/base-db-services.js";
import { motors } from "../database/schemas/motors.js";
import { sendResponse } from "../utils/send-response.js";
const paramsValidateException = new ParamsValidateException();
export class MotorHandlers {
    addMotor = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const motorPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(motorPayload);
            const validMotorReq = await validatedRequest("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);
            await saveSingleRecord(motors, { ...motorPayload, created_by: userPayload.id });
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
}
