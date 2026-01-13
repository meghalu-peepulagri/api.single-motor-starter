import { USER_DETAILS_FETCHED, USER_NOT_FOUND, USER_UPDATE_VALIDATION_CRITERIA, USER_UPDATED, USERS_LIST } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { userActivityLogs } from "../database/schemas/user-activity-logs.js";
import { users } from "../database/schemas/users.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { userFilters } from "../helpers/user-helper.js";
import { getRecordsConditionally, getSingleRecordByMultipleColumnValues, saveRecords, updateRecordById } from "../services/db/base-db-services.js";
import { paginatedUsersList } from "../services/db/user-service.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { ActivityService } from "../services/db/activity-service.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class UserHandlers {
    list = async (c) => {
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
    userProfile = async (c) => {
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
                user = userPayload;
            }
            return sendResponse(c, 200, USER_DETAILS_FETCHED, user);
        }
        catch (error) {
            console.error("Error at user profile : ", error);
            throw error;
        }
    };
    usersBasicList = async (c) => {
        try {
            const query = c.req.query();
            const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
            const searchString = query.search_string?.trim() || "";
            const whereQueryData = {
                columns: ["status", "user_type"],
                relations: ["!=", "!="],
                values: ["ARCHIVED", "ADMIN"],
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
    updateUserDetails = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const userId = +c.req.param("id");
            paramsValidateException.validateId(userId, "user id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest("signup", reqBody, USER_UPDATE_VALIDATION_CRITERIA);
            const verifiedUser = await getSingleRecordByMultipleColumnValues(users, ["id", "status"], ["=", "!="], [userId, "ARCHIVED"]);
            if (!verifiedUser)
                throw new NotFoundException(USER_NOT_FOUND);
            await db.transaction(async (trx) => {
                const updatedUser = await updateRecordById(users, userId, validUserReq, trx);
                await ActivityService.writeUserUpdatedLog(userId, userPayload.id, verifiedUser, updatedUser, trx);
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
}
