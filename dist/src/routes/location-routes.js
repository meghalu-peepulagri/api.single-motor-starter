import factory from "../factory.js";
import { LocationHandlers } from "../handlers/location-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
const locationHandlers = new LocationHandlers();
const locationRoutes = factory.createApp();
locationRoutes.post("/", isAuthorized, locationHandlers.addLocation);
locationRoutes.get("/", isAuthorized, locationHandlers.list);
export default locationRoutes;
