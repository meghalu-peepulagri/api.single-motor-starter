
import factory from "../factory.js";
import { UserActivityHandlers } from "../handlers/user-activity-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const userActivitiesHandler = new UserActivityHandlers();
const userActivitiesRoutes = factory.createApp();

userActivitiesRoutes.get("/:user_id", isAuthorized, userActivitiesHandler.getUserActivities);

export default userActivitiesRoutes;
