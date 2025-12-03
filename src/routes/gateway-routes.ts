import factory from "../factory.js";
import { StarterHandlers } from "../handlers/starter-handlers.js";
import { isAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const gatewaysHandlers = new StarterHandlers();
const gatewayRoutes = factory.createApp();

// gatewayRoutes.post("/", isAuthorized, isAdmin, gatewaysHandlers.addGateway);

export default gatewayRoutes;
