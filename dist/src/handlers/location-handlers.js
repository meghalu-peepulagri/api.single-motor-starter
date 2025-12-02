import { LOCATION_ADDED, LOCATION_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { locations } from "../database/schemas/locations.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import { saveSingleRecord } from "../services/db/base-db-services.js";
const paramsValidateException = new ParamsValidateException();
export class LocationHandlers {
    addLocation = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const locationPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(locationPayload);
            const validLocationReq = await validatedRequest("add-location", locationPayload, LOCATION_VALIDATION_CRITERIA);
            const newLocation = { ...locationPayload, user_id: validLocationReq.user_id || userPayload.id, created_by: userPayload.id };
            await saveSingleRecord(locations, newLocation);
            return sendResponse(c, 201, LOCATION_ADDED);
        }
        catch (error) {
            console.error("Error at add location :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at add location :", error);
            throw error;
        }
    };
}
