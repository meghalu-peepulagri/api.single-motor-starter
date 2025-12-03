import type { Context } from "hono";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { validatedRequest } from "../validations/validate-request.js";
import type { validatedAddStarter } from "../validations/schema/starter-validations.js";
import { GATEWAY_REQUIRED, STARTER_BOX_ADDED_SUCCESSFULLY, STARTER_BOX_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { sendResponse } from "../utils/send-response.js";
import { gateways, type GatewayTable } from "../database/schemas/gateways.js";
import { getSingleRecordByMultipleColumnValues } from "../services/db/base-db-services.js";
import { addStarterWithTransaction } from "../services/db/starter-services.js";
import BadRequestException from "../exceptions/bad-request-exception.js";

const paramsValidateException = new ParamsValidateException();

export class StarterHandlers {

  addStarterBox = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const starterBoxPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(starterBoxPayload);

      const validStarterBoxReq = await validatedRequest<validatedAddStarter>("add-starter", starterBoxPayload, STARTER_BOX_VALIDATION_CRITERIA);
      const existedGateway = await getSingleRecordByMultipleColumnValues<GatewayTable>(gateways, ["id", "status"], ["=", "!="], [validStarterBoxReq.gateway_id, "ARCHIVED"]);
      if (!existedGateway) throw new BadRequestException(GATEWAY_REQUIRED);

      await addStarterWithTransaction(validStarterBoxReq, userPayload);
      return sendResponse(c, 201, STARTER_BOX_ADDED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at add starter box :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at add starter box :", error);
      throw error;
    }
  }
}