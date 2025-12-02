import { FIELD_ADDED, FIELD_UPDATED, FIELD_VALIDATION_CRITERIA, FIELDS_FETCHED, SIMILAR_MOTOR_TITLE_NOT_ALLOWED } from "../constants/app-constants.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { fieldFilters } from "../helpers/filed-helper.js";
import { checkDuplicateMotorTitles } from "../helpers/motor-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { addFieldWithMotorTransaction, paginatedFieldsList, updateFieldWithMotorTransaction } from "../services/db/field-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class FieldHandlers {
    addField = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const fieldPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(fieldPayload);
            const validFieldReq = await validatedRequest("add-field", fieldPayload, FIELD_VALIDATION_CRITERIA);
            const identifiedDuplicates = checkDuplicateMotorTitles(validFieldReq.motors);
            if (identifiedDuplicates.length)
                throw new BadRequestException(SIMILAR_MOTOR_TITLE_NOT_ALLOWED);
            await addFieldWithMotorTransaction(validFieldReq, userPayload);
            return sendResponse(c, 201, FIELD_ADDED);
        }
        catch (error) {
            console.error("Error at add field :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at add field :", error);
            throw error;
        }
    };
    listFields = async (c) => {
        try {
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const whereQueryData = fieldFilters(query);
            const fieldsList = await paginatedFieldsList(whereQueryData, orderQueryData, paginationParams, query);
            return sendResponse(c, 200, FIELDS_FETCHED, fieldsList);
        }
        catch (error) {
            console.error("Error at list of fields :", error);
            throw error;
        }
    };
    updateField = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const fieldId = +c.req.param("id");
            const fieldPayload = await c.req.json();
            paramsValidateException.validateId(fieldId, "field id");
            paramsValidateException.emptyBodyValidation(fieldPayload);
            const validFieldReq = await validatedRequest("add-field", fieldPayload, FIELD_VALIDATION_CRITERIA);
            await updateFieldWithMotorTransaction(validFieldReq, fieldId);
            return sendResponse(c, 200, FIELD_UPDATED);
        }
        catch (error) {
            console.error("Error at update pond :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at update pond :", error);
            throw error;
        }
    };
}
