import type { Context } from "hono";
import { ALL_DISPATCHES_FETCHED_SUCCESSFULLY, EXPIRING_DISPATCH_FETCHED, INVOICE_UPLOAD_URL_GENERATED, STARTER_BOX_NOT_FOUND, STARTER_DISPATCH_ADDED_SUCCESSFULLY, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, STARTER_DISPATCH_NOT_FOUND, STARTER_DISPATCH_UPDATED_SUCCESSFULLY, STARTER_DISPATCH_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import { starterDispatch, type StarterDispatchTable } from "../database/schemas/starter-dispatch.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { formatExpiringRecords, preparedPayloadOfDispatchData, preparedStarterBoxUpdateData, preparedUpdatePayloadOfDispatchData } from "../helpers/starter-dispatch-helper.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getPaginationData, getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getAllDispatches, getExpiringDispatches, getExpiringDispatchesCount, getStarterDispatchByStarterId } from "../services/db/starter-dispatch-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedAddStarterDispatch } from "../validations/schema/starter-dispatch-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { generateDownloadUrl, generateInvoiceUploadUrl } from "../services/s3/s3-service.js";

const paramsValidateException = new ParamsValidateException();

const hasOwn = (obj: unknown, prop: string) => Object.prototype.hasOwnProperty.call(obj as object, prop);

async function requireActiveDispatch(dispatchId: number) {
  const dispatch = await getSingleRecordByMultipleColumnValues<StarterDispatchTable>(starterDispatch,
    ["id", "status"], ["=", "!="], [dispatchId, "ARCHIVED"]);

  if (!dispatch) {
    throw new NotFoundException(STARTER_DISPATCH_NOT_FOUND);
  }

  return dispatch;
}

async function requireActiveStarterBoxIfAny(starterId: number | null | undefined) {
  if (starterId == null) return null;

  const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes,
    ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);

  if (!starter) {
    throw new NotFoundException(STARTER_BOX_NOT_FOUND);
  }

  return starter;
}

async function ensureUniqueSimNoForUpdate(simNo: string, dispatchId: number) {
  const existedSimNumberRecord = await getSingleRecordByMultipleColumnValues<StarterDispatchTable>(starterDispatch,
    ["sim_no", "id", "status"], ["=", "!=", "!="], [simNo, dispatchId, "ARCHIVED"]);

  if (existedSimNumberRecord) {
    throw new ConflictException(`SIM number already existed.`);
  }
}

function applyOptionalDispatchFields(
  dispatchUpdate: any,
  rawPayload: any,
  validDispatchReq: ValidatedAddStarterDispatch,
) {
  if (hasOwn(rawPayload, "tracking_details")) dispatchUpdate.tracking_details = validDispatchReq.tracking_details;
  if (hasOwn(rawPayload, "remarks")) dispatchUpdate.remarks = validDispatchReq.remarks;
  if (hasOwn(rawPayload, "invoice_document")) dispatchUpdate.invoice_document = validDispatchReq.invoice_document;
}

export class StarterDispatchHandlers {

  getAllDispatchHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const search = query.search_string?.trim();
      const order_by = query.order_by as string | undefined;
      const order_type = query.order_type as string | undefined;

      const records = await getAllDispatches(search, order_by, order_type);

      const recordsWithUrls = await Promise.all(
        records.map(async (record: any) => {
          if (!record.invoice_document) return record;
          const invoice_document_url = await generateDownloadUrl(record.invoice_document);
          return { ...record, invoice_document_url };
        })
      );

      return sendResponse(c, 200, ALL_DISPATCHES_FETCHED_SUCCESSFULLY, recordsWithUrls);
    } catch (error: any) {
      console.error("Error at get all dispatches :", error);
      throw error;
    }
  };

  addStarterDispatchHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const dispatchPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(dispatchPayload);

      const validDispatchReq = await validatedRequest<ValidatedAddStarterDispatch>(
        "add-starter-dispatch", dispatchPayload, STARTER_DISPATCH_VALIDATION_CRITERIA
      );

      let existedStarter: StarterBox | null = null;
      if (validDispatchReq.starter_id != null) {
        existedStarter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes,
          ["id", "status"], ["=", "!="], [validDispatchReq.starter_id, "ARCHIVED"]);
        if (!existedStarter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
      }

      const existedSimNumberRecord = await getSingleRecordByMultipleColumnValues<StarterDispatchTable>(starterDispatch,
        ["sim_no", "status"], ["=", "!="], [validDispatchReq.sim_no, "ARCHIVED"]);

      if (existedSimNumberRecord) {
        throw new ConflictException(`SIM number already existed.`);
      }

      const preparedPayload = preparedPayloadOfDispatchData(validDispatchReq, userPayload.id);

      const operations: Promise<any>[] = [saveSingleRecord<StarterDispatchTable>(starterDispatch, preparedPayload)];
      if (existedStarter) {
        const starterBoxUpdate = preparedStarterBoxUpdateData(preparedPayload);
        operations.push(updateRecordById(starterBoxes, existedStarter.id, starterBoxUpdate));
      }
      await Promise.all(operations);

      return sendResponse(c, 201, STARTER_DISPATCH_ADDED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at add starter dispatch :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

  updateStarterDispatchHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const dispatchId = +c.req.param("id");
      paramsValidateException.validateId(dispatchId, "Dispatch id");

      const dispatchPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(dispatchPayload);

      const validDispatchReq = await validatedRequest<ValidatedAddStarterDispatch>(
        "update-starter-dispatch", dispatchPayload, STARTER_DISPATCH_VALIDATION_CRITERIA
      );

      const existedDispatch = await requireActiveDispatch(dispatchId);

      const starterIdProvided = hasOwn(dispatchPayload, "starter_id");
      const nextStarterId = starterIdProvided ? validDispatchReq.starter_id : existedDispatch.starter_id;
      const existedStarter = await requireActiveStarterBoxIfAny(nextStarterId);

      await ensureUniqueSimNoForUpdate(validDispatchReq.sim_no, dispatchId);

      const { dispatchUpdate, starterBoxUpdate } = preparedUpdatePayloadOfDispatchData(
        validDispatchReq,
        userPayload.id,
        starterIdProvided ? validDispatchReq.starter_id : undefined,
      );

      applyOptionalDispatchFields(dispatchUpdate, dispatchPayload, validDispatchReq);

      await Promise.all([
        updateRecordById<StarterDispatchTable>(starterDispatch, dispatchId, dispatchUpdate),
        ...(existedStarter ? [updateRecordById(starterBoxes, existedStarter.id, starterBoxUpdate)] : []),
      ]);

      return sendResponse(c, 200, STARTER_DISPATCH_UPDATED_SUCCESSFULLY);
    } catch (error: any) {
      console.error("Error at update starter dispatch :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

  uploadInvoiceHandler = async (c: Context) => {
    try {
      const contentType = c.req.header("Content-Type") ?? "application/pdf";

      const { uploadUrl, key } = await generateInvoiceUploadUrl(Date.now(), contentType);

      return sendResponse(c, 200, INVOICE_UPLOAD_URL_GENERATED, { uploadUrl, key });
    } catch (error: any) {
      console.error("Error at upload invoice :", error);
      throw error;
    }
  };

  getExpiringDispatchHandler = async (c: Context) => {
    try {
      const query = c.req.query();
      const type = query.type as string | undefined;
      const order_by = query.order_by as string | undefined;
      const order_type = query.order_type as string | undefined;
      const { page, pageSize, offset } = getPaginationOffParams(query);

      const totalRecords = await getExpiringDispatchesCount(type);
      const paginationInfo = getPaginationData(page, pageSize, totalRecords);

      const expiringRecords = await getExpiringDispatches(type, offset, pageSize, order_by, order_type);
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

      if (!dispatchRecords) {
        throw new NotFoundException(STARTER_DISPATCH_NOT_FOUND);
      }

      const invoiceDocumentUrl = dispatchRecords.invoice_document
        ? await generateDownloadUrl(dispatchRecords.invoice_document)
        : undefined;

      const responseData = {
        ...dispatchRecords,
        ...(invoiceDocumentUrl ? { invoice_document_url: invoiceDocumentUrl } : {}),
      };

      return sendResponse(c, 200, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, responseData);
    } catch (error: any) {
      console.error("Error at get starter dispatch :", error);
      throw error;
    }
  };
}
