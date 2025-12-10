import factory from "../factory.js";
import { StarterHandlers } from "../handlers/starter-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorHandlers = new StarterHandlers();
const starterRoutes = factory.createApp();

starterRoutes.post("/", isAuthorized, motorHandlers.addStarterBox);

export default starterRoutes;
