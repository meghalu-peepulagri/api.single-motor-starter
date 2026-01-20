import { ACTIVITY_LOGS_FETCHED } from "../constants/app-constants.js";
import { userActivityLogs } from "../database/schemas/user-activity-logs.js";
import { activityFilters } from "../helpers/activity-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getPaginatedRecordsConditionally } from "../services/db/base-db-services.js";
import { sendResponse } from "../utils/send-response.js";
export class ActivityHandlers {
    getAllActivitiesHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const whereQueryData = activityFilters(query, userPayload);
            const orderByQueryData = {
                columns: ["created_at"],
                values: ["desc"]
            };
            const activities = await getPaginatedRecordsConditionally(userActivityLogs, paginationParams.page, paginationParams.pageSize, orderByQueryData, whereQueryData, ["id", "performed_by", "action", "entity_type", "entity_id", "message", "created_at"]);
            return sendResponse(c, 200, ACTIVITY_LOGS_FETCHED, activities);
        }
        catch (error) {
            console.error("Error at get all activities :", error);
            throw error;
        }
    };
}
