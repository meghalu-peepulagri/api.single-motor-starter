import type { Context } from "hono";
import { USERS_LIST } from "../constants/app-constants.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { userFilters } from "../helpers/user-helper.js";
import { paginatedUsersList } from "../services/db/user-service.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { sendResponse } from "../utils/send-response.js";


export class UserHandlers {
  list = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);

      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);
      const whereQueryData = userFilters(query, userPayload);
      const usersList = await paginatedUsersList(whereQueryData, orderQueryData, paginationParams);
      return sendResponse(c, 200, USERS_LIST, usersList);
    } catch (error: any) {
      console.error("Error at list of users :", error);
      throw error;
    }
  }
}