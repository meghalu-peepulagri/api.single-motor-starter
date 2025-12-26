import type { Context } from "hono";
import { USER_ACTIVITIES } from "../constants/app-constants.js";
import { userActivityLogs, type UserActivityLogsTable } from "../database/schemas/user-activity-logs.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getRecordsConditionally } from "../services/db/base-db-services.js";
import type { WhereQueryData } from "../types/db-types.js";
import { parseOrderByQueryCondition } from "../utils/db-utils.js";
import { sendResponse } from "../utils/send-response.js";

const paramsValidateException = new ParamsValidateException();

export class UserActivityHandlers {

  getUserActivities = async (c: Context) => {
    try {
      const userId = +c.req.param("user_id");
      paramsValidateException.validateId(userId, "user id");
      const query = c.req.query();
      const orderQueryData = parseOrderByQueryCondition(query.order_by, query.order_type);

      const whereQueryData: WhereQueryData<UserActivityLogsTable> = {
        columns: ["user_id"],
        relations: ["="],
        values: [userId],
      }

      const usersActivities = await getRecordsConditionally<UserActivityLogsTable>(userActivityLogs, whereQueryData, ["id", "user_id", "action", "old_data", "new_data", "field_name"], orderQueryData);
      return sendResponse(c, 200, USER_ACTIVITIES, usersActivities);
    } catch (error: any) {
      console.error("Error at list of users  activities :", error);
      throw error;
    }
  }
};