import factory from "../factory.js";
import { AnalyticsHandlers } from "../handlers/analytics-handlers.js";
import { isSuperAdminOrAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
const handlers = new AnalyticsHandlers();
const analyticsRoutes = factory.createApp();
analyticsRoutes.get("/payload-validations", isAuthorized, isSuperAdminOrAdmin, handlers.getPayloadAnalyticsHandler);
export default analyticsRoutes;
