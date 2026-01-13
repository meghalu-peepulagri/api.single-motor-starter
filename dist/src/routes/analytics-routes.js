import factory from "../factory.js";
import { AnalyticsHandlers } from "../handlers/analytics-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import { isAdmin } from "../middlewares/guards/guardUser.js";
const handlers = new AnalyticsHandlers();
const analyticsRoutes = factory.createApp();
analyticsRoutes.get("/payload-validations", isAuthorized, isAdmin, handlers.getPayloadAnalyticsHandler);
export default analyticsRoutes;
