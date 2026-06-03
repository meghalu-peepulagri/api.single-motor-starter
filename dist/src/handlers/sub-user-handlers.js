import { sendResponse } from "../utils/send-response.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { handleAppError } from "../utils/on-error.js";
import { SUB_USERS_FETCHED, SUB_USER_CREATED, SUB_USER_DELETED, SUB_USER_NOT_FOUND, SUB_USER_PERMISSIONS_FETCHED, SUB_USER_PERMISSIONS_UPDATED, SUB_USER_PERMISSIONS_REMOVED, MOBILE_NUMBER_ALREADY_EXIST, CREATE_SUB_USER_VALIDATION_CRITERIA, SET_SUB_USER_PERMISSIONS_VALIDATION_CRITERIA, REMOVE_SUB_USER_PERMISSIONS_VALIDATION_CRITERIA, } from "../constants/app-constants.js";
import { createSubUser, getSubUsers, softDeleteSubUser, getSubUserPermissions, setSubUserPermissions, removeSubUserPermissions, isPhoneTaken, } from "../services/db/sub-user-services.js";
import { validatedRequest } from "../validations/validate-request.js";
import { ActivityService } from "../services/db/activity-service.js";
const paramsValidateException = new ParamsValidateException();
function resolveParentId(userType, userId, queryUserId) {
    if (userType === "USER")
        return userId;
    if (!queryUserId)
        throw new BadRequestException("user_id query param is required");
    return paramsValidateException.validateId(Number(queryUserId), "user_id");
}
export class SubUserHandlers {
    listSubUsersHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const parentId = resolveParentId(user.user_type, user.id, c.req.query("user_id"));
            const data = await getSubUsers(parentId);
            return sendResponse(c, 200, SUB_USERS_FETCHED, data);
        }
        catch (error) {
            handleAppError(error, "list sub-users");
        }
    };
    createSubUserHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const parentId = resolveParentId(user.user_type, user.id, c.req.query("user_id"));
            const body = await c.req.json();
            paramsValidateException.emptyBodyValidation(body);
            const validated = await validatedRequest("create-sub-user", body, CREATE_SUB_USER_VALIDATION_CRITERIA);
            if (await isPhoneTaken(validated.phone))
                throw new ConflictException(MOBILE_NUMBER_ALREADY_EXIST);
            const created = await createSubUser(parentId, user.id, validated);
            const { password, ...result } = created;
            await ActivityService.logActivity({
                userId: created.id,
                performedBy: user.id,
                action: "SUB_USER_CREATED",
                entityType: "USER",
                entityId: created.id,
                newData: { full_name: created.full_name, phone: created.phone },
            });
            return sendResponse(c, 201, SUB_USER_CREATED, result);
        }
        catch (error) {
            handleAppError(error, "create sub-user");
        }
    };
    deleteSubUserHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const deleted = await softDeleteSubUser(subId);
            if (!deleted)
                throw new NotFoundException(SUB_USER_NOT_FOUND);
            await ActivityService.logActivity({
                userId: subId,
                performedBy: user.id,
                action: "SUB_USER_DELETED",
                entityType: "USER",
                entityId: subId,
            });
            return sendResponse(c, 200, SUB_USER_DELETED);
        }
        catch (error) {
            handleAppError(error, "delete sub-user");
        }
    };
    getPermissionsHandler = async (c) => {
        try {
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const permissions = await getSubUserPermissions(subId);
            return sendResponse(c, 200, SUB_USER_PERMISSIONS_FETCHED, { permissions });
        }
        catch (error) {
            handleAppError(error, "get sub-user permissions");
        }
    };
    setPermissionsHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const body = await c.req.json();
            const validated = await validatedRequest("set-sub-user-permissions", body, SET_SUB_USER_PERMISSIONS_VALIDATION_CRITERIA);
            const oldPermissions = await getSubUserPermissions(subId);
            const updated = await setSubUserPermissions(subId, validated.permissions);
            if (!updated)
                throw new NotFoundException(SUB_USER_NOT_FOUND);
            await ActivityService.logActivity({
                userId: subId,
                performedBy: user.id,
                action: "SUB_USER_PERMISSIONS_SET",
                entityType: "USER",
                entityId: subId,
                oldData: { permissions: oldPermissions },
                newData: { permissions: validated.permissions },
            });
            return sendResponse(c, 200, SUB_USER_PERMISSIONS_UPDATED);
        }
        catch (error) {
            handleAppError(error, "set sub-user permissions");
        }
    };
    removePermissionsHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const body = await c.req.json();
            const validated = await validatedRequest("remove-sub-user-permissions", body, REMOVE_SUB_USER_PERMISSIONS_VALIDATION_CRITERIA);
            const result = await removeSubUserPermissions(subId, validated.permissions);
            if (!result)
                throw new NotFoundException(SUB_USER_NOT_FOUND);
            await ActivityService.logActivity({
                userId: subId,
                performedBy: user.id,
                action: "SUB_USER_PERMISSIONS_REMOVED",
                entityType: "USER",
                entityId: subId,
                oldData: { permissions: result.old },
                newData: { permissions: result.new },
            });
            return sendResponse(c, 200, SUB_USER_PERMISSIONS_REMOVED);
        }
        catch (error) {
            handleAppError(error, "remove sub-user permissions");
        }
    };
}
