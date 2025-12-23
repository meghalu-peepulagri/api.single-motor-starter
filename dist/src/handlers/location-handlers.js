import { eq, ne } from "drizzle-orm";
import { LOCATION_ADDED, LOCATION_DELETED, LOCATION_NOT_FOUND, LOCATION_VALIDATION_CRITERIA, LOCATIONS_FETCHED } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { locations } from "../database/schemas/locations.js";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { locationFilters } from "../helpers/location-helpers.js";
import { getRecordsCount, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordByIdWithTrx } from "../services/db/base-db-services.js";
import { getLocationsList, locationDropDown } from "../services/db/location-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
const paramsValidateException = new ParamsValidateException();
export class LocationHandlers {
    addLocation = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const locationPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(locationPayload);
            const validLocationReq = await validatedRequest("add-location", locationPayload, LOCATION_VALIDATION_CRITERIA);
            const newLocation = { ...validLocationReq, user_id: validLocationReq.user_id ? validLocationReq.user_id : userPayload.id, created_by: userPayload.id };
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
    list = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const userDetails = query.user_id && !isNaN(Number(query.user_id)) ? Number(query.user_id) : Number(userPayload.id);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const whereQueryData = locationFilters(query, userDetails);
            const locationsList = await getLocationsList(whereQueryData, orderQueryData);
            return sendResponse(c, 200, LOCATIONS_FETCHED, locationsList);
        }
        catch (error) {
            console.error("Error at list of locations :", error);
            throw error;
        }
    };
    listBasic = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const userDetails = query.user_id && !isNaN(Number(query.user_id)) ? Number(query.user_id) : Number(userPayload.id);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const whereQueryData = locationFilters(query, userDetails);
            const locationsList = await locationDropDown(orderQueryData, whereQueryData);
            return sendResponse(c, 200, LOCATIONS_FETCHED, locationsList);
        }
        catch (error) {
            console.error("Error at list of locations  drop down:", error);
            throw error;
        }
    };
    renameLocation = async (c) => {
        try {
            const locationId = +c.req.param("id");
            const reqData = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqData);
            paramsValidateException.validateId(locationId, "location id");
            const validLocationReq = await validatedRequest("add-location", reqData, LOCATION_VALIDATION_CRITERIA);
            await db.transaction(async (trx) => {
                await updateRecordByIdWithTrx(locations, locationId, validLocationReq);
            });
            return sendResponse(c, 200, LOCATION_ADDED);
        }
        catch (error) {
            console.error("Error at rename location :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at rename location :", error);
            throw error;
        }
    };
    deleteLocation = async (c) => {
        try {
            const locationId = +c.req.param("id");
            paramsValidateException.validateId(locationId, "location id");
            const foundedLocation = await getSingleRecordByMultipleColumnValues(locations, ["id", "status"], ["=", "!="], [locationId, "ARCHIVED"]);
            if (!foundedLocation)
                throw new NotFoundException(LOCATION_NOT_FOUND);
            const connectedStartersCount = await getRecordsCount(starterBoxes, [eq(starterBoxes.location_id, locationId), ne(starterBoxes.status, "ARCHIVED")]);
            if (connectedStartersCount > 0) {
                throw new BadRequestException("Location has connected pumps. Cannot delete.");
            }
            await db.transaction(async (trx) => {
                await updateRecordByIdWithTrx(locations, locationId, { status: "ARCHIVED" });
            });
            return sendResponse(c, 200, LOCATION_DELETED);
        }
        catch (error) {
            console.error("Error at delete location :", error);
            handleJsonParseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at delete location :", error);
            throw error;
        }
    };
}
