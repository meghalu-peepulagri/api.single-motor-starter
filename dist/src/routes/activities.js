import factory from "../factory.js";
import { ActivityHandlers } from "../handlers/activity-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
const activityHandlers = new ActivityHandlers();
const activitiesRoutes = factory.createApp();
activitiesRoutes.get("/", isAuthorized, activityHandlers.getAllActivitiesHandler);
export default activitiesRoutes;
