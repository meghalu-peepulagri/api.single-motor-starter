import type { Context } from "hono";
import { EXPIRING_DISPATCH_FETCHED, STARTER_BOX_NOT_FOUND, STARTER_DISPATCH_ADDED_SUCCESSFULLY, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, STARTER_DISPATCH_NOT_FOUND, STARTER_DISPATCH_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import { starterDispatch, type StarterDispatchTable } from "../database/schemas/starter-dispatch.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { formatExpiringRecords, preparedPayloadOfDispatchData, preparedStarterBoxUpdateData } from "../helpers/starter-dispatch-helper.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getPaginationData, getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getExpiringDispatches, getExpiringDispatchesCount, getStarterDispatchByStarterId } from "../services/db/starter-dispatch-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedAddStarterDispatch } from "../validations/schema/starter-dispatch-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import ConflictException from "../exceptions/conflict-exception.js";

const paramsValidateException = new ParamsValidateException();

export class StarterDispatchHandlers {

  addStarterDispatchHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const dispatchPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(dispatchPayload);

      const validDispatchReq = await validatedRequest<ValidatedAddStarterDispatch>(
        "add-starter-dispatch", dispatchPayload, STARTER_DISPATCH_VALIDATION_CRITERIA
      );

      const existedStarter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes,
        ["id", "status"], ["=", "!="], [validDispatchReq.starter_id, "ARCHIVED"]);

      if (!existedStarter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

      const existedSimNumberRecord = await getSingleRecordByMultipleColumnValues<StarterDispatchTable>(starterDispatch,
        ["sim_no", "status"], ["=", "!="], [validDispatchReq.sim_no, "ARCHIVED"]);

      if (existedSimNumberRecord) {
        throw new ConflictException(`SIM number already existed.`);
      }

      const preparedPayload = preparedPayloadOfDispatchData(validDispatchReq, userPayload.id);
      const starterBoxUpdate = preparedStarterBoxUpdateData(preparedPayload);

      await Promise.all([
        updateRecordById(starterBoxes, existedStarter.id, starterBoxUpdate),
        saveSingleRecord<StarterDispatchTable>(starterDispatch, preparedPayload)
      ]);

      return sendResponse(c, 201, STARTER_DISPATCH_ADDED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at add starter dispatch :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

  getExpiringDispatchHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const type = query.type as string | undefined;
      const { page, pageSize, offset } = getPaginationOffParams(query);

      const totalRecords = await getExpiringDispatchesCount(type);
      const paginationInfo = getPaginationData(page, pageSize, totalRecords);

      const expiringRecords = await getExpiringDispatches(type, offset, pageSize);
      const formattedRecords = formatExpiringRecords(expiringRecords, type);

      const response = {
        pagination: paginationInfo,
        records: formattedRecords,
      };

      return sendResponse(c, 200, EXPIRING_DISPATCH_FETCHED, response);
    } catch (error: any) {
      console.error("Error at get expiring dispatch :", error);
      throw error;
    }
  };

  getStarterDispatchByStarterIdHandler = async (c: Context) => {
    try {
      const starterId = +c.req.param("starterId");
      paramsValidateException.validateId(starterId, "Starter id");

      const dispatchRecords = await getStarterDispatchByStarterId(starterId);

      if (!dispatchRecords || dispatchRecords.length === 0) {
        throw new NotFoundException(STARTER_DISPATCH_NOT_FOUND);
      }

      return sendResponse(c, 200, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, dispatchRecords);
    } catch (error: any) {
      console.error("Error at get starter dispatch :", error);
      throw error;
    }
  };
}
