import * as v from "valibot";
import { sendResponse } from "../utils/send-response.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { handleAppError } from "../utils/on-error.js";
import { SUB_USERS_FETCHED, SUB_USER_CREATED, SUB_USER_DELETED, SUB_USER_NOT_FOUND, SUB_USER_PERMISSIONS_FETCHED, SUB_USER_PERMISSIONS_UPDATED, SUB_USER_PERMISSIONS_ASSIGNED, SUB_USER_PERMISSIONS_REMOVED, } from "../constants/app-constants.js";
import { createSubUser, getSubUsers, softDeleteSubUser, getSubUserPermissions, setSubUserPermissions, assignSubUserPermissions, removeSubUserPermissions, } from "../services/db/sub-user-services.js";
import { createSubUserSchema, updatePermissionsSchema, assignPermissionsSchema, removePermissionsSchema, } from "../validations/schema/sub-user-validations.js";
import { ActivityService } from "../services/db/activity-service.js";
const paramsValidateException = new ParamsValidateException();
export class SubUserHandlers {
    listSubUsersHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const queryUserId = c.req.query("user_id");
            const targetId = queryUserId ? paramsValidateException.validateId(Number(queryUserId), "user_id") : user.id;
            const data = await getSubUsers(targetId);
            return sendResponse(c, 200, SUB_USERS_FETCHED, data);
        }
        catch (error) {
            handleAppError(error, "list sub-users");
        }
    };
    createSubUserHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const body = await c.req.json();
            paramsValidateException.emptyBodyValidation(body);
            const validated = v.parse(createSubUserSchema, body);
            const created = await createSubUser(user.id, validated);
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
            if (error instanceof v.ValiError)
                throw new BadRequestException(error.message);
            handleAppError(error, "create sub-user");
        }
    };
    deleteSubUserHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const deleted = await softDeleteSubUser(user.id, subId);
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
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const permissions = await getSubUserPermissions(subId, user.id);
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
            const validated = v.parse(updatePermissionsSchema, body);
            const oldPermissions = await getSubUserPermissions(subId, user.id);
            const updated = await setSubUserPermissions(subId, user.id, validated.permissions);
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
            if (error instanceof v.ValiError)
                throw new BadRequestException(error.message);
            handleAppError(error, "set sub-user permissions");
        }
    };
    assignPermissionsHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const body = await c.req.json();
            const { permissions } = v.parse(assignPermissionsSchema, body);
            const result = await assignSubUserPermissions(subId, user.id, permissions);
            if (!result)
                throw new NotFoundException(SUB_USER_NOT_FOUND);
            await ActivityService.logActivity({
                userId: subId,
                performedBy: user.id,
                action: "SUB_USER_PERMISSIONS_ASSIGNED",
                entityType: "USER",
                entityId: subId,
                oldData: { permissions: result.old },
                newData: { permissions: result.new },
            });
            return sendResponse(c, 200, SUB_USER_PERMISSIONS_ASSIGNED);
        }
        catch (error) {
            if (error instanceof v.ValiError)
                throw new BadRequestException(error.message);
            handleAppError(error, "assign sub-user permissions");
        }
    };
    removePermissionsHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const subId = Number(c.req.param("id"));
            paramsValidateException.validateId(subId, "sub-user id");
            const body = await c.req.json();
            const { permissions } = v.parse(removePermissionsSchema, body);
            const result = await removeSubUserPermissions(subId, user.id, permissions);
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
            if (error instanceof v.ValiError)
                throw new BadRequestException(error.message);
            handleAppError(error, "remove sub-user permissions");
        }
    };
}
