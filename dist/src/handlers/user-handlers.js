import { LOGGED_OUT, MOBILE_NUMBER_ALREADY_EXIST, USER_DELETED, USER_DETAILS_FETCHED, USER_DETAILS_WITH_LOCATIONS_FETCHED, USER_NOT_FOUND, USER_UPDATE_VALIDATION_CRITERIA, USER_UPDATED, USERS_LIST } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { deviceTokens } from "../database/schemas/device-tokens.js";
import { users } from "../database/schemas/users.js";
import ConflictException from "../exceptions/conflict-exception.js";
import ForbiddenException from "../exceptions/forbidden-exception.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { checkInternalPhoneUniqueness, userFilters } from "../helpers/user-helper.js";
import { ActivityService } from "../services/db/activity-service.js";
import { deleteRecordById, getRecordsConditionally, getSingleRecordByMultipleColumnValues, updateRecordById } from "../services/db/base-db-services.js";
import { checkPhoneUniqueness, deleteUserWithCascade, getUserDetailsWithLocations, paginatedUsersList } from "../services/db/user-services.js";
import { getSubUserPermissions } from "../services/db/sub-user-services.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { logger } from "../utils/logger.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class UserHandlers {
    listUsersHandler = async (c) => {
        try {
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const whereQueryData = userFilters(query);
            const usersList = await paginatedUsersList(whereQueryData, orderQueryData, paginationParams);
            return sendResponse(c, 200, USERS_LIST, usersList);
        }
        catch (error) {
            console.error("Error at list of users :", error);
            throw error;
        }
    };
    userProfileHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            let user = null;
            const query = c.req.query();
            if (query.user_id) {
                const userId = +query.user_id;
                paramsValidateException.validateId(userId, "user id");
                if (userPayload?.id !== userId) {
                    const whereQueryData = { columns: ["id", "status"], relations: ["=", "!="], values: [userId, "ARCHIVED"] };
                    const userRecord = await getSingleRecordByMultipleColumnValues(users, whereQueryData.columns, whereQueryData.relations, whereQueryData.values);
                    if (!userRecord)
                        throw new NotFoundException(USER_NOT_FOUND);
                    const { password, ...cleanUser } = userRecord;
                    user = cleanUser;
                }
                else {
                    user = userPayload;
                }
            }
            else {
                const subUser = c.get("sub_user_payload");
                if (subUser) {
                    const permissions = await getSubUserPermissions(subUser.id);
                    return sendResponse(c, 200, USER_DETAILS_FETCHED, { ...subUser, permissions });
                }
                user = userPayload;
            }
            return sendResponse(c, 200, USER_DETAILS_FETCHED, user);
        }
        catch (error) {
            console.error("Error at user profile : ", error);
            throw error;
        }
    };
    usersBasicListHandler = async (c) => {
        try {
            const query = c.req.query();
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const searchString = query.search_string?.trim() || "";
            const whereQueryData = {
                columns: ["status", "user_type", "user_type", "user_type"],
                relations: ["!=", "!=", "!=", "!="],
                values: ["ARCHIVED", "ADMIN", "SUPER_ADMIN", "SUB_USER"],
            };
            if (searchString) {
                whereQueryData.columns.push("full_name");
                whereQueryData.relations.push("contains");
                whereQueryData.values.push(searchString);
            }
            const usersList = await getRecordsConditionally(users, whereQueryData, ["id", "full_name"], orderQueryData);
            return sendResponse(c, 200, USERS_LIST, usersList);
        }
        catch (error) {
            console.error("Error at users basic list:", error);
            throw error;
        }
    };
    updateUserDetailsHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const userId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(userId, "user id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest("signup", reqBody, USER_UPDATE_VALIDATION_CRITERIA);
            const allPhones = checkInternalPhoneUniqueness(validUserReq);
            const isPhoneUnique = await checkPhoneUniqueness(allPhones, userId);
            if (!isPhoneUnique) {
                throw new ConflictException(MOBILE_NUMBER_ALREADY_EXIST);
            }
            const verifiedUser = await getSingleRecordByMultipleColumnValues(users, ["id", "status"], ["=", "!="], [userId, "ARCHIVED"]);
            if (!verifiedUser)
                throw new NotFoundException(USER_NOT_FOUND);
            await db.transaction(async (trx) => {
                const updatedUser = await updateRecordById(users, userId, validUserReq, trx);
                await ActivityService.writeUserUpdatedLog(userId, c.get("performer_id"), verifiedUser, updatedUser, trx);
            });
            return sendResponse(c, 201, USER_UPDATED);
        }
        catch (error) {
            console.error("Error at update user details :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            console.error("Error at update user details :", error);
            throw error;
        }
    };
    userDetailsWithLocationsHandler = async (c) => {
        try {
            const userId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(userId, "user id");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const result = await getUserDetailsWithLocations(userId, paginationParams);
            if (!result)
                throw new NotFoundException(USER_NOT_FOUND);
            return sendResponse(c, 200, USER_DETAILS_WITH_LOCATIONS_FETCHED, result);
        }
        catch (error) {
            console.error("Error at user details with locations :", error);
            throw error;
        }
    };
    userLogOutHandler = async (c) => {
        try {
            const id = +(c.req.param("id") ?? 0);
            const reqData = await c.req.json().catch(() => ({}));
            const fcmToken = reqData?.fcm_token;
            if (fcmToken) {
                const tokenData = await getSingleRecordByMultipleColumnValues(deviceTokens, ["device_token", "user_id"], ["=", "="], [fcmToken, id], ["id"]);
                if (tokenData) {
                    await deleteRecordById(deviceTokens, tokenData.id);
                }
            }
            await ActivityService.logActivity({
                performedBy: id,
                action: "LOGGED_OUT",
                entityType: "AUTH",
                entityId: id,
            });
            return sendResponse(c, 200, LOGGED_OUT);
        }
        catch (err) {
            logger.error("Error at logout", err);
            console.error("Error at logout", err.message);
            throw err;
        }
    };
    deleteUserHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const userId = +(c.req.param("id") ?? 0);
            paramsValidateException.validateId(userId, "user id");
            const targetUser = await getSingleRecordByMultipleColumnValues(users, ["id", "status"], ["=", "!="], [userId, "ARCHIVED"], ["id", "user_type", "full_name", "phone", "email"]);
            if (!targetUser)
                throw new NotFoundException(USER_NOT_FOUND);
            const isSelf = userPayload.id === userId;
            if (!isSelf) {
                if (userPayload.user_type === "USER") {
                    throw new ForbiddenException("Unauthorized");
                }
                if (targetUser.user_type === "SUPER_ADMIN") {
                    throw new ForbiddenException("Cannot delete a SUPER_ADMIN account");
                }
                if (userPayload.user_type === "ADMIN" && targetUser.user_type === "ADMIN") {
                    throw new ForbiddenException("ADMIN cannot delete another ADMIN account");
                }
            }
            await deleteUserWithCascade(userId, c.get("performer_id"), isSelf, {
                full_name: targetUser.full_name ?? null,
                phone: targetUser.phone,
                email: targetUser.email ?? null,
                user_type: targetUser.user_type ?? null,
            });
            return sendResponse(c, 200, USER_DELETED);
        }
        catch (error) {
            console.error("Error at delete user :", error);
            throw error;
        }
    };
}
