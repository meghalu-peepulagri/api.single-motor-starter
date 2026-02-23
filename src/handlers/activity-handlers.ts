import type { Context } from "hono";
import { ACTIVITY_LOGS_FETCHED } from "../constants/app-constants.js";
import { userActivityLogs, type UserActivityLogsTable } from "../database/schemas/user-activity-logs.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { activityFilters } from "../helpers/activity-helper.js";
import { getPaginationOffParams } from "../helpers/pagination-helper.js";
import { getPaginatedRecordsConditionally } from "../services/db/base-db-services.js";
import { getMotorBasedStarterDetails } from "../services/db/motor-services.js";
import type { motorBasedStarterDetails } from "../types/app-types.js";
import type { OrderByQueryData } from "../types/db-types.js";
import { sendResponse } from "../utils/send-response.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";

const paramsValidateException = new ParamsValidateException();

export class ActivityHandlers {
  getAllActivitiesHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const query = c.req.query();
      const paginationParams = getPaginationOffParams(query);

      let deviceAssignedAt: motorBasedStarterDetails | undefined;

      if (query.device_id) {
        // When device_id is provided, use it directly as a filter
        paramsValidateException.validateId(Number(query.device_id), "device id");
      } else {
        // Existing flow: require entity_id and look up starter details
        const entityId = Number(query.entity_id);
        paramsValidateException.validateId(entityId, "entity id");
        const deviceDetails = await getMotorBasedStarterDetails(entityId);

        if (!deviceDetails || !deviceDetails.starter) {
          throw new BadRequestException("Starter details not found");
        }

        deviceAssignedAt = deviceDetails.starter;
      }

      const whereQueryData = activityFilters(query, userPayload, deviceAssignedAt);

      const orderByQueryData: OrderByQueryData<UserActivityLogsTable> = {
        columns: ["created_at"],
        values: ["desc"],
      };

      const activities =
        await getPaginatedRecordsConditionally<UserActivityLogsTable>(
          userActivityLogs,
          paginationParams.page,
          paginationParams.pageSize,
          orderByQueryData,
          whereQueryData,
          ["id", "performed_by", "action", "entity_type", "entity_id", "device_id", "message", "created_at"]
        );

      return sendResponse(c, 200, ACTIVITY_LOGS_FETCHED, activities);
    } catch (error: any) {
      console.error("Error at get all activities:", error);
      throw error;
    }
  };
}