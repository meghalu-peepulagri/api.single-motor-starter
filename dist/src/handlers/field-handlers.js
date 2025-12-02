import { FIELD_ADDED, FIELD_VALIDATION_CRITERIA, SIMILAR_MOTOR_TITLE_NOT_ALLOWED } from "../constants/app-constants.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { checkDuplicateMotorTitles } from "../helpers/motor-helper.js";
import { addFieldWithMotorTransaction } from "../services/db/field-services.js";
import { handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class FieldHandlers {
    addFieldHandlers = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const fieldPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(fieldPayload);
            const validFieldReq = await validatedRequest("add-field", fieldPayload, FIELD_VALIDATION_CRITERIA);
            const identifiedDuplicates = checkDuplicateMotorTitles(validFieldReq.motors);
            if (identifiedDuplicates)
                throw new BadRequestException(SIMILAR_MOTOR_TITLE_NOT_ALLOWED);
            addFieldWithMotorTransaction(validFieldReq, userPayload);
            return sendResponse(c, 201, FIELD_ADDED);
        }
        catch (error) {
            handleJsonParseError(error);
            parseDatabaseError(error);
            console.error("Error at add field :", error);
            throw error;
        }
    };
}
