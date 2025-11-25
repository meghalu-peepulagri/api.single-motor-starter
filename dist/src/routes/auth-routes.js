import factory from "../factory.js";
import { AuthHandlers } from "../handlers/auth-handlers.js";
import { isAuthorized, isOptionalAuthorized } from "../middlewares/isAuthorized.js";
const authHandlers = new AuthHandlers();
const authRoutes = factory.createApp();
authRoutes.post("/register", isAuthorized, isOptionalAuthorized, authHandlers.createUserHandlers);
export default authRoutes;
