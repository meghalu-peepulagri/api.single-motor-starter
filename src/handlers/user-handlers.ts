import type { Context } from "hono";
import { USER_DETAILS_FETCHED, USER_NOT_FOUND, USER_UPDATE_VALIDATION_CRITERIA, USER_UPDATED, USERS_LIST } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { users, type UsersTable } from "../database/schemas/users.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { userFilters } from "../helpers/user-helper.js";
import { getRecordsConditionally, getSingleRecordByMultipleColumnValues, saveRecords, updateRecordByIdWithTrx } from "../services/db/base-db-services.js";
import { paginatedUsersList } from "../services/db/user-service.js";
import type { WhereQueryData } from "../types/db-types.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedSignUpUser } from "../validations/schema/user-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import { userActivityLogs, type UserActivityLogsTable } from "../database/schemas/user-activity-logs.js";

const paramsValidateException = new ParamsValidateException();

export class UserHandlers {
  list = async (c: Context) => {
    try {
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);

      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = userFilters(query);
      const usersList = await paginatedUsersList(whereQueryData, orderQueryData, paginationParams);
      return sendResponse(c, 200, USERS_LIST, usersList);
    } catch (error: any) {
      console.error("Error at list of users :", error);
      throw error;
    }
  }

  userProfile = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      type UserRow = typeof users.$inferSelect;
      let user: UserRow | null = null;
      const query = c.req.query();

      if (query.user_id) {
        const userId = +query.user_id;
        paramsValidateException.validateId(userId, "user id");
        if (userPayload?.id !== userId) {
          const whereQueryData: WhereQueryData<UsersTable> = { columns: ["id", "status"], relations: ["=", "!="], values: [userId, "ARCHIVED"] };
          const userRecord = await getSingleRecordByMultipleColumnValues<UsersTable>(users, whereQueryData.columns, whereQueryData.relations, whereQueryData.values);
          if (!userRecord) throw new NotFoundException(USER_NOT_FOUND);
          const { password, ...cleanUser } = userRecord;
          user = cleanUser as UserRow;
        } else {
          user = userPayload;
        }
      } else {
        user = userPayload;
      }

      return sendResponse(c, 200, USER_DETAILS_FETCHED, user);
    } catch (error: any) {
      console.error("Error at user profile : ", error);
      throw error;
    }
  };


  usersBasicList = async (c: Context) => {
    try {
      const query = c.req.query();
      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);

      const searchString = query.search_string?.trim() || "";
      const userWhereQueryData: WhereQueryData<UsersTable> = { columns: ["full_name"], relations: ["contains"], values: [searchString] };

      const usersList = await getRecordsConditionally<UsersTable>(users, userWhereQueryData, ["id", "full_name"], orderQueryData);
      return sendResponse(c, 200, USERS_LIST, usersList);
    } catch (error: any) {
      console.error("Error at users basic list:", error);
      throw error;
    }
  };

  updateUserDetails = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const userId = +c.req.param("id");
      paramsValidateException.validateId(userId, "user id");
      const reqBody = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqBody);
      const validUserReq = await validatedRequest<ValidatedSignUpUser>("signup", reqBody, USER_UPDATE_VALIDATION_CRITERIA);

      const verifiedUser = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["id", "status"], ["=", "!="], [userId, "ARCHIVED"]);
      if (!verifiedUser) throw new NotFoundException(USER_NOT_FOUND);

      const fieldsToTrack = ["full_name", "phone", "email"] as const;
      const logs = fieldsToTrack.filter((field) => validUserReq[field] !== verifiedUser[field]).map((field) => ({
        field_name: field,
        user_id: userId,
        action: "UPDATED",
        performed_by: userPayload.id,
        old_data: String(verifiedUser[field] ?? ""),
        new_data: String(validUserReq[field] ?? ""),
      }));

      await db.transaction(async (trx) => {
        await updateRecordByIdWithTrx<UsersTable>(users, userId, { ...validUserReq }, trx);
        if (logs.length) await saveRecords<UserActivityLogsTable>(userActivityLogs, logs, trx);
      })

      return sendResponse(c, 200, USER_UPDATED);
    } catch (error: any) {
      console.error("Error at update user details :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      console.error("Error at update user details :", error);
      throw error;
    }
  }

}