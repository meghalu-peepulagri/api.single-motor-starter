import { EXPIRING_DISPATCH_FETCHED, INVOICE_UPLOAD_URL_GENERATED, STARTER_BOX_NOT_FOUND, STARTER_DISPATCH_ADDED_SUCCESSFULLY, STARTER_DISPATCH_FETCHED_SUCCESSFULLY, STARTER_DISPATCH_NOT_FOUND, STARTER_DISPATCH_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { starterDispatch } from "../database/schemas/starter-dispatch.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { formatExpiringRecords, preparedPayloadOfDispatchData, preparedStarterBoxUpdateData } from "../helpers/starter-dispatch-helper.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getPaginationData, getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getExpiringDispatches, getExpiringDispatchesCount, getStarterDispatchByStarterId } from "../services/db/starter-dispatch-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { generateDownloadUrl, generateInvoiceUploadUrl } from "../services/s3/s3-service.js";
const paramsValidateException = new ParamsValidateException();
export class StarterDispatchHandlers {
    addStarterDispatchHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const dispatchPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(dispatchPayload);
            const validDispatchReq = await validatedRequest("add-starter-dispatch", dispatchPayload, STARTER_DISPATCH_VALIDATION_CRITERIA);
            let existedStarter = null;
            if (validDispatchReq.starter_id != null) {
                existedStarter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [validDispatchReq.starter_id, "ARCHIVED"]);
                if (!existedStarter)
                    throw new NotFoundException(STARTER_BOX_NOT_FOUND);
            }
            const existedSimNumberRecord = await getSingleRecordByMultipleColumnValues(starterDispatch, ["sim_no", "status"], ["=", "!="], [validDispatchReq.sim_no, "ARCHIVED"]);
            if (existedSimNumberRecord) {
                throw new ConflictException(`SIM number already existed.`);
            }
            const preparedPayload = preparedPayloadOfDispatchData(validDispatchReq, userPayload.id);
            const operations = [saveSingleRecord(starterDispatch, preparedPayload)];
            if (existedStarter) {
                const starterBoxUpdate = preparedStarterBoxUpdateData(preparedPayload);
                operations.push(updateRecordById(starterBoxes, existedStarter.id, starterBoxUpdate));
            }
            await Promise.all(operations);
            return sendResponse(c, 201, STARTER_DISPATCH_ADDED_SUCCESSFULLY);
        }
        catch (error) {
            console.error("Error at add starter dispatch :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    uploadInvoiceHandler = async (c) => {
        try {
            const contentType = c.req.header("Content-Type") ?? "application/pdf";
            const { uploadUrl, key } = await generateInvoiceUploadUrl(Date.now(), contentType);
            return sendResponse(c, 200, INVOICE_UPLOAD_URL_GENERATED, { uploadUrl, key });
        }
        catch (error) {
            console.error("Error at upload invoice :", error);
            throw error;
        }
    };
    getExpiringDispatchHandler = async (c) => {
        try {
            const query = c.req.query();
            const type = query.type;
            const order_by = query.order_by;
            const order_type = query.order_type;
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
        }
        catch (error) {
            console.error("Error at get starter dispatch :", error);
            throw error;
        }
    };
}
