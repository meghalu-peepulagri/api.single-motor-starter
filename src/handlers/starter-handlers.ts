import type { Context } from "hono";
import { GATEWAY_NOT_FOUND, STARER_NOT_DEPLOYED, STARTER_ALREADY_ASSIGNED, STARTER_ASSIGNED_SUCCESSFULLY, STARTER_BOX_ADDED_SUCCESSFULLY, STARTER_BOX_NOT_FOUND, STARTER_BOX_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { gateways, type GatewayTable } from "../database/schemas/gateways.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getSingleRecordByMultipleColumnValues } from "../services/db/base-db-services.js";
import { addStarterWithTransaction, assignStarterWithTransaction } from "../services/db/starter-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddStarter, validatedAssignStarter } from "../validations/schema/starter-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import type { User } from "../database/schemas/users.js";

const paramsValidateException = new ParamsValidateException();

export class StarterHandlers {

  addStarterBox = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const starterBoxPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(starterBoxPayload);

      const validStarterBoxReq = await validatedRequest<validatedAddStarter>("add-starter", starterBoxPayload, STARTER_BOX_VALIDATION_CRITERIA);

      if (validStarterBoxReq.gateway_id) {
        const existedGateway = await getSingleRecordByMultipleColumnValues<GatewayTable>(gateways, ["id", "status"], ["=", "!="], [validStarterBoxReq.gateway_id, "ARCHIVED"]);
        if (!existedGateway) throw new BadRequestException(GATEWAY_NOT_FOUND);

      }
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


  assignStarter = async (c: Context) => {
    try {
      const userPayload: User = c.get("user_payload");
      const reqData = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqData);

      const validatedReqData = await validatedRequest<validatedAssignStarter>("assign-starter", reqData, STARTER_BOX_VALIDATION_CRITERIA);
      const starterBox = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["pcb_number", "status"], ["=", "!="], [validatedReqData.pcb_number, "ARCHIVED"], ["id", "status"]);
      if (!starterBox) throw new BadRequestException(STARTER_BOX_NOT_FOUND);
      if (starterBox.status === "ASSIGNED") throw new BadRequestException(STARTER_ALREADY_ASSIGNED);
      if (starterBox.status !== "DEPLOYED") throw new BadRequestException(STARER_NOT_DEPLOYED);

      await assignStarterWithTransaction(validatedReqData, userPayload, starterBox);
      return sendResponse(c, 201, STARTER_ASSIGNED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at assign starter :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at assign starter :", error);
      throw error;
    }
  }
}