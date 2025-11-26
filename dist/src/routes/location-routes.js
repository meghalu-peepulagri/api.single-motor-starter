import factory from "../factory.js";
import { LocationHandlers } from "../handlers/location-handlers.js";
import { isUserOrAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
const locationHandlers = new LocationHandlers();
const locationRoutes = factory.createApp();
locationRoutes.post("/", isAuthorized, isUserOrAdmin, locationHandlers.addLocation);
export default locationRoutes;
