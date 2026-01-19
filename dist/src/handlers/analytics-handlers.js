import { getCompletePayloadAnalytics } from "../services/db/analytics-services.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";
export class AnalyticsHandlers {
    async getPayloadAnalyticsHandler(c) {
        try {
            const query = c.req.query();
            const fromDate = query.from_date || undefined;
            const toDate = query.to_date || undefined;
            const starterId = query.starter_id ? +(query.starter_id) : undefined;
            const analytics = await getCompletePayloadAnalytics({ fromDate, toDate, starterId });
            return sendResponse(c, 200, "Analytics fetched successfully", analytics);
        }
        catch (error) {
            logger.error("Error in get Payload Analytics Handler : ", error);
            console.error("Error at get Payload Analytics Handler : ", error);
            throw error;
        }
    }
}
