import { eq } from "drizzle-orm";
import { GATEWAY_ADDED, GATEWAY_ASSIGNED_SUCCESSFULLY, GATEWAY_DELETED, GATEWAY_DETAILS_FETCHED, GATEWAY_LABEL_UPDATED, GATEWAY_NOT_FOUND, GATEWAY_NUMBER_UPDATED, GATEWAY_RENAMED, GATEWAY_VALIDATION_CRITERIA, GATEWAYS_FETCHED } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { gateways } from "../database/schemas/gateways.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { prepareGatewayAddedLog, prepareGatewayAssignedLog, prepareGatewayDeletedLog, prepareGatewayLabelUpdatedLog, prepareGatewayNumberUpdatedLog, prepareGatewayRenamedLog } from "../helpers/gateway-activity-helper.js";
import { gatewayFilters, getGatewayIdentifierLowers } from "../helpers/gateway-helpers.js";
import { ActivityService } from "../services/db/activity-service.js";
import { saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { assertGatewayIdentifiersUnique, assignGatewayToUser, getGatewayDetails, getGatewayForOwnerAction, getGatewaysList } from "../services/db/gateway-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import ForbiddenException from "../exceptions/forbidden-exception.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
const paramsValidateException = new ParamsValidateException();
export class GatewayHandlers {
    addGatewayHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const gatewayPayload = await c.req.json();
            paramsValidateException.emptyBodyValidation(gatewayPayload);
            const validGatewayReq = await validatedRequest("add-gateway", gatewayPayload, GATEWAY_VALIDATION_CRITERIA);
            const gatewayName = validGatewayReq.name?.trim()
                ? validGatewayReq.name.trim()
                : validGatewayReq.gateway_number.trim();
            const identifiers = getGatewayIdentifierLowers({ ...validGatewayReq, name: gatewayName });
            await assertGatewayIdentifiersUnique(identifiers);
            const newGateway = {
                ...validGatewayReq,
                name: gatewayName,
                user_id: null,
                created_by: userPayload.id,
            };
            await db.transaction(async (tx) => {
                const createdGateway = await saveSingleRecord(gateways, newGateway, tx);
                const log = prepareGatewayAddedLog({
                    performedBy: userPayload.id,
                    userId: createdGateway.user_id ?? userPayload.id,
                    gateway: createdGateway,
                });
                await ActivityService.saveActivityLogs([log], tx);
            });
            return sendResponse(c, 201, GATEWAY_ADDED);
        }
        catch (error) {
            console.error("Error at add gateway :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    assignGatewayToUserHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqBody = await c.req.json();
            const validReq = await validatedRequest("assign-gateway", reqBody, GATEWAY_VALIDATION_CRITERIA);
            const isAdmin = userPayload.user_type === "ADMIN" || userPayload.user_type === "SUPER_ADMIN";
            const targetUserId = validReq.user_id ?? userPayload.id;
            if (validReq.user_id && !isAdmin)
                throw new ForbiddenException();
            const result = await db.transaction(async (tx) => {
                const assignment = await assignGatewayToUser({
                    mac_address: validReq.mac_address ?? undefined,
                    pcb_number: validReq.pcb_number ?? undefined,
                    gateway_number: validReq.gateway_number ?? undefined,
                    name: validReq.name ?? undefined,
                    targetUserId,
                    performedByUserId: userPayload.id,
                }, tx);
                if (!assignment)
                    throw new NotFoundException(GATEWAY_NOT_FOUND);
                const log = prepareGatewayAssignedLog({
                    performedBy: userPayload.id,
                    userId: targetUserId,
                    gatewayId: assignment.gateway_id,
                    gatewayName: assignment.name,
                    oldUserId: assignment.old_user_id,
                    newUserId: targetUserId,
                });
                await ActivityService.saveActivityLogs([log], tx);
                return assignment;
            });
            return sendResponse(c, 200, GATEWAY_ASSIGNED_SUCCESSFULLY, { gateway_id: result.gateway_id });
        }
        catch (error) {
            console.error("Error at assign gateway :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    listGatewaysHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const isAdmin = userPayload?.user_type === "ADMIN" || userPayload?.user_type === "SUPER_ADMIN";
            const requestedUserId = query.user_id && !isNaN(Number(query.user_id)) ? Number(query.user_id) : undefined;
            const userIdFilter = isAdmin ? requestedUserId : Number(userPayload.id);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const whereQueryData = gatewayFilters(query, userIdFilter);
            const gatewaysList = await getGatewaysList(whereQueryData, orderQueryData, paginationParams);
            return sendResponse(c, 200, GATEWAYS_FETCHED, gatewaysList);
        }
        catch (error) {
            console.error("Error at list of gateways :", error);
            throw error;
        }
    };
    getGatewayDetailsHandler = async (c) => {
        try {
            const gatewayId = +c.req.param("id");
            paramsValidateException.validateId(gatewayId, "gateway id");
            const gateway = await getGatewayDetails(gatewayId);
            if (!gateway)
                throw new NotFoundException(GATEWAY_NOT_FOUND);
            return sendResponse(c, 200, GATEWAY_DETAILS_FETCHED, gateway);
        }
        catch (error) {
            console.error("Error at get gateway details :", error);
            throw error;
        }
    };
    deleteGatewayHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const gatewayId = +c.req.param("id");
            paramsValidateException.validateId(gatewayId, "gateway id");
            const foundGateway = await getGatewayForOwnerAction(gatewayId, userPayload.id, ["id", "name", "label", "status", "user_id"]);
            if (!foundGateway)
                throw new NotFoundException(GATEWAY_NOT_FOUND);
            await db.transaction(async (tx) => {
                await tx.update(starterBoxes).set({ gateway_id: null, updated_at: new Date() }).where(eq(starterBoxes.gateway_id, foundGateway.id));
                await updateRecordById(gateways, foundGateway.id, { status: "ARCHIVED", user_id: null }, tx);
                const log = prepareGatewayDeletedLog({
                    performedBy: userPayload.id,
                    userId: userPayload.id,
                    gateway: foundGateway,
                });
                await ActivityService.saveActivityLogs([log], tx);
            });
            return sendResponse(c, 200, GATEWAY_DELETED);
        }
        catch (error) {
            console.error("Error at delete gateway :", error);
            handleJsonParseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    updateGatewayLabelHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const gatewayId = +c.req.param("id");
            paramsValidateException.validateId(gatewayId, "gateway id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validReq = await validatedRequest("update-gateway-label", reqBody, "Gateway label details provided do not meet the required validation criteria");
            const gateway = await getGatewayForOwnerAction(gatewayId, userPayload.id, ["id", "label", "user_id"]);
            if (!gateway)
                throw new NotFoundException(GATEWAY_NOT_FOUND);
            await db.transaction(async (tx) => {
                await updateRecordById(gateways, gatewayId, { label: validReq.label }, tx);
                const log = prepareGatewayLabelUpdatedLog({
                    performedBy: userPayload.id,
                    userId: gateway.user_id ?? userPayload.id,
                    gatewayId,
                    oldLabel: gateway.label,
                    newLabel: validReq.label,
                });
                await ActivityService.saveActivityLogs([log], tx);
            });
            return sendResponse(c, 200, GATEWAY_LABEL_UPDATED);
        }
        catch (error) {
            console.error("Error at update gateway label :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    renameGatewayHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const gatewayId = +c.req.param("id");
            paramsValidateException.validateId(gatewayId, "gateway id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validReq = await validatedRequest("rename-gateway", reqBody, "Gateway rename details provided do not meet the required validation criteria");
            const gateway = await getGatewayForOwnerAction(gatewayId, userPayload.id, ["id", "name", "user_id"]);
            if (!gateway)
                throw new NotFoundException(GATEWAY_NOT_FOUND);
            await db.transaction(async (tx) => {
                await updateRecordById(gateways, gatewayId, { name: validReq.name }, tx);
                const log = prepareGatewayRenamedLog({
                    performedBy: userPayload.id,
                    userId: gateway.user_id ?? userPayload.id,
                    gatewayId,
                    oldName: gateway.name,
                    newName: validReq.name,
                });
                await ActivityService.saveActivityLogs([log], tx);
            });
            return sendResponse(c, 200, GATEWAY_RENAMED);
        }
        catch (error) {
            console.error("Error at rename gateway :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
    updateGatewayNumberHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const gatewayId = +c.req.param("id");
            paramsValidateException.validateId(gatewayId, "gateway id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validReq = await validatedRequest("update-gateway-number", reqBody, "Gateway number details provided do not meet the required validation criteria");
            const gateway = await getGatewayForOwnerAction(gatewayId, userPayload.id, ["id", "gateway_number", "user_id", "name"]);
            if (!gateway)
                throw new NotFoundException(GATEWAY_NOT_FOUND);
            await db.transaction(async (tx) => {
                await updateRecordById(gateways, gatewayId, { gateway_number: validReq.gateway_number }, tx);
                const log = prepareGatewayNumberUpdatedLog({
                    performedBy: userPayload.id,
                    userId: gateway.user_id ?? userPayload.id,
                    gatewayId,
                    gatewayName: gateway.name,
                    oldGatewayNumber: gateway.gateway_number,
                    newGatewayNumber: validReq.gateway_number,
                });
                await ActivityService.saveActivityLogs([log], tx);
            });
            return sendResponse(c, 200, GATEWAY_NUMBER_UPDATED);
        }
        catch (error) {
            console.error("Error at update gateway number :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };
}
