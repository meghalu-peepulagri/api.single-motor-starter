import { getCompletePayloadAnalytics } from "../services/db/analytics-services.js";
import { logger } from "../utils/logger.js";
export class AnalyticsHandlers {
    async getPayloadAnalyticsHandler(c) {
        try {
            const fromDate = c.req.query("from_date") || undefined;
            const toDate = c.req.query("to_date") || undefined;
            const starterId = c.req.query("starter_id") ? Number(c.req.query("starter_id")) : undefined;
            const analytics = await getCompletePayloadAnalytics({ fromDate, toDate, starterId });
            return c.json({
                success: true,
                message: "Analytics fetched successfully",
                data: analytics
            });
        }
        catch (error) {
            logger.error("Error in get Payload Analytics Handler : ", error);
            console.error("Error at get Payload Analytics Handler : ", error);
            throw error;
        }
    }
}
