import type { Context } from "hono";
import { LOCATION_ADDED, LOCATION_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { locations, type LocationsTable } from "../database/schemas/locations.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { saveRecord } from "../services/db/base-db-services.js";
import { parseUniqueConstraintError } from "../utils/on-error.js";
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

      const newLocation = { ...locationPayload, user_id: validLocationReq.user_id || userPayload.id, created_by: userPayload.id };
      await saveRecord<LocationsTable>(locations, newLocation);
      return sendResponse(c, 201, LOCATION_ADDED,);
    } catch (error: any) {
      if (error.message?.includes("Unexpected end of JSON")) {
        throw new BadRequestException("Invalid or missing JSON body");
      }
      // Duplicate value error
      const pgError = error.cause ?? error;
      if (pgError?.code === "23505") {
        return parseUniqueConstraintError(pgError);
      }
      // Foreign key violation
      if (pgError?.code === "23503") {
        const [, field, value] = pgError.detail?.match(/\((.*?)\)=\((.*?)\)/) || [];
        throw new BadRequestException(field && value ? `Invalid foreign key: ${field} '${value}' does not exist` : "Invalid foreign key value: Referenced record not found");
      }
      console.error("Error at add location :", error);
      throw error;
    }
  }
}