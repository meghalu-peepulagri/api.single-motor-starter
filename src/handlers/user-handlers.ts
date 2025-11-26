import type { Context } from "hono";
import { USER_DETAILS_FETCHED, USERS_LIST } from "../constants/app-constants.js";
import { users, type UsersTable } from "../database/schemas/users.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { userFilters } from "../helpers/user-helper.js";
import { getRecordsConditionally } from "../services/db/base-db-services.js";
import { paginatedUsersList } from "../services/db/user-service.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { sendResponse } from "../utils/send-response.js";
import type { WhereQueryData } from "../types/db-types.js";


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
      return sendResponse(c, 200, USER_DETAILS_FETCHED, userPayload);
    } catch (error: any) {
      console.error("Error at user profile : ", error);
      throw error;
    }
  }

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

}