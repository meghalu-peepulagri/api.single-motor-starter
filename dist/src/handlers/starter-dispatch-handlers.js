import { EXPIRING_DISPATCH_FETCHED, STARTER_BOX_NOT_FOUND, STARTER_DISPATCH_ADDED_SUCCESSFULLY, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, STARTER_DISPATCH_NOT_FOUND, STARTER_DISPATCH_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { starterDispatch } from "../database/schemas/starter-dispatch.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { formatExpiringRecords, preparedPayloadOfDispatchData } from "../helpers/starter-dispatch-helper.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord } from "../services/db/base-db-services.js";
import { getExpiringDispatches, getStarterDispatchByStarterId } from "../services/db/starter-dispatch-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class StarterDispatchHandlers {
    addStarterDispatchHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const dispatchPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(dispatchPayload);
            const validDispatchReq = await validatedRequest("add-starter-dispatch", dispatchPayload, STARTER_DISPATCH_VALIDATION_CRITERIA);
            const existedStarter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validDispatchReq.starter_id, "ARCHIVED"]);
            if (!existedStarter)
                throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            const preparedPayload = preparedPayloadOfDispatchData(validDispatchReq, userPayload.id);
            const savedRecord = await saveSingleRecord(starterDispatch, preparedPayload);
            return sendResponse(c, 201, STARTER_DISPATCH_ADDED_SUCCESSFULLY, savedRecord);
        }
        catch (error) {
            console.error("Error at add starter dispatch :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    getExpiringDispatchHandler = async (c) => {
        try {
            const type = c.req.query("type");
            const expiringRecords = await getExpiringDispatches(type);
            const formattedRecords = formatExpiringRecords(expiringRecords, type);
            return sendResponse(c, 200, EXPIRING_DISPATCH_FETCHED, formattedRecords);
        }
        catch (error) {
            console.error("Error at get expiring dispatch :", error);
            throw error;
        }
    };
    getStarterDispatchByStarterIdHandler = async (c) => {
        try {
            const starterId = +c.req.param("starterId");
            paramsValidateException.validateId(starterId, "Starter id");
            const dispatchRecords = await getStarterDispatchByStarterId(starterId);
            if (!dispatchRecords || dispatchRecords.length === 0) {
                throw new NotFoundException(STARTER_DISPATCH_NOT_FOUND);
            }
            return sendResponse(c, 200, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, dispatchRecords);
        }
        catch (error) {
            console.error("Error at get starter dispatch :", error);
            throw error;
        }
    };
}
