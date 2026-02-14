import { ACTIVITY_LOGS_FETCHED } from "../constants/app-constants.js";
import { userActivityLogs } from "../database/schemas/user-activity-logs.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { activityFilters } from "../helpers/activity-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getPaginatedRecordsConditionally } from "../services/db/base-db-services.js";
import { getMotorBasedStarterDetails } from "../services/db/motor-services.js";
import { sendResponse } from "../utils/send-response.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
const paramsValidateException = new ParamsValidateException();
export class ActivityHandlers {
    getAllActivitiesHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const query = c.req.query();
            const paginationParams = getPaginationOffParams(query);
            const entityId = Number(query.entity_id);
            paramsValidateException.validateId(entityId, "entity id");
            const deviceDetails = await getMotorBasedStarterDetails(entityId);
            if (!deviceDetails || !deviceDetails.starter) {
                throw new BadRequestException("Starter details not found");
            }
            const deviceAssignedAt = deviceDetails.starter;
            const whereQueryData = activityFilters(query, userPayload, deviceAssignedAt);
            const orderByQueryData = {
                columns: ["created_at"],
                values: ["desc"],
            };
            const activities = await getPaginatedRecordsConditionally(userActivityLogs, paginationParams.page, paginationParams.pageSize, orderByQueryData, whereQueryData, ["id", "performed_by", "action", "entity_type", "entity_id", "message", "created_at"]);
            return sendResponse(c, 200, ACTIVITY_LOGS_FETCHED, activities);
        }
        catch (error) {
            console.error("Error at get all activities:", error);
            throw error;
        }
    };
}
