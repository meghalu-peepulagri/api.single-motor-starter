import { eq, ne } from "drizzle-orm";
import type { Context } from "hono";
import { LOCATION_ADDED, LOCATION_DELETED, LOCATION_NOT_FOUND, LOCATION_VALIDATION_CRITERIA, LOCATIONS_FETCHED } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { locations, type LocationsTable } from "../database/schemas/locations.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { locationFilters } from "../helpers/location-helpers.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getRecordsCount, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getLocationsList, locationDropDown } from "../services/db/location-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedAddLocation } from "../validations/schema/location-validations.js";
import { validatedRequest } from "../validations/validate-request.js";

const paramsValidateException = new ParamsValidateException();

export class LocationHandlers {

  addLocation = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const locationPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(locationPayload);

      const validLocationReq = await validatedRequest<ValidatedAddLocation>("add-location", locationPayload, LOCATION_VALIDATION_CRITERIA);
      const newLocation = { ...validLocationReq, user_id: validLocationReq.user_id ? validLocationReq.user_id : userPayload.id, created_by: userPayload.id };

      await db.transaction(async (trx) => {
        const location = await saveSingleRecord<LocationsTable>(locations, newLocation, trx);
        await ActivityService.writeLocationAddedLog(userPayload.id, location.id, { name: location.name }, trx);
      });

      return sendResponse(c, 201, LOCATION_ADDED);
    } catch (error: any) {
      console.error("Error at add location :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at add location :", error);
      throw error;
    }
  }

  list = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const userDetails = query.user_id && !isNaN(Number(query.user_id)) ? Number(query.user_id) : Number(userPayload.id);

      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = locationFilters(query, userDetails);

      const locationsList = await getLocationsList(whereQueryData, orderQueryData);
      return sendResponse(c, 200, LOCATIONS_FETCHED, locationsList);
    } catch (error: any) {
      console.error("Error at list of locations :", error);
      throw error;
    }
  }

  listBasic = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const userDetails = query.user_id && !isNaN(Number(query.user_id)) ? Number(query.user_id) : Number(userPayload.id);
      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = locationFilters(query, userDetails);

      const locationsList = await locationDropDown(orderQueryData, whereQueryData);
      return sendResponse(c, 200, LOCATIONS_FETCHED, locationsList);
    } catch (error: any) {
      console.error("Error at list of locations  drop down:", error);
      throw error;
    }
  }

  renameLocation = async (c: Context) => {
    try {
      const locationId = +c.req.param("id");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);
      paramsValidateException.validateId(locationId, "location id");
      const validLocationReq = await validatedRequest<ValidatedAddLocation>("add-location", reqData, LOCATION_VALIDATION_CRITERIA);

      const foundedLocation = await getSingleRecordByMultipleColumnValues<LocationsTable>(locations, ["id", "status"], ["=", "!="], [locationId, "ARCHIVED"]);
      if (!foundedLocation) throw new NotFoundException(LOCATION_NOT_FOUND);

      await db.transaction(async (trx) => {
        const updatedLocation = await updateRecordById<LocationsTable>(locations, locationId, validLocationReq, trx);
        await ActivityService.writeLocationRenamedLog((c.get("user_payload")).id, locationId, { name: foundedLocation.name }, { name: updatedLocation.name }, trx);
      })
      return sendResponse(c, 200, LOCATION_ADDED);
    } catch (error: any) {
      console.error("Error at rename location :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at rename location :", error);
      throw error;
    }
  }

  deleteLocation = async (c: Context) => {
    try {
      const locationId = +c.req.param("id");
      paramsValidateException.validateId(locationId, "location id");
      const foundedLocation = await getSingleRecordByMultipleColumnValues<LocationsTable>(locations, ["id", "status"], ["=", "!="], [locationId, "ARCHIVED"]);
      if (!foundedLocation) throw new NotFoundException(LOCATION_NOT_FOUND);

      const connectedStartersCount = await getRecordsCount(starterBoxes, [eq(starterBoxes.location_id, locationId), ne(starterBoxes.status, "ARCHIVED")]);
      if (connectedStartersCount > 0) {
        throw new BadRequestException("Location has connected devices. Cannot delete.");
      }

      await db.transaction(async (trx) => {
        await updateRecordById<LocationsTable>(locations, locationId, { status: "ARCHIVED" }, trx);
        await ActivityService.writeLocationDeletedLog((c.get("user_payload")).id, locationId, trx);
      })
      return sendResponse(c, 200, LOCATION_DELETED);
    } catch (error: any) {
      console.error("Error at delete location :", error);
      handleJsonParseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at delete location :", error);
      throw error;
    }
  }
}