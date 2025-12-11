import factory from "../factory.js";
import { StarterHandlers } from "../handlers/starter-handlers.js";
import { isAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorHandlers = new StarterHandlers();
const starterRoutes = factory.createApp();


starterRoutes.post("/", isAuthorized, motorHandlers.addStarterBox);
starterRoutes.get("/mobile", isAuthorized, motorHandlers.starterListMobile);
starterRoutes.get("/web/all", isAuthorized, isAdmin, motorHandlers.starterListWeb);
starterRoutes.patch("/assign", isAuthorized, motorHandlers.assignStarterMobile);

export default starterRoutes;
