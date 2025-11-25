import factory from "../factory.js";
import { AuthHandlers } from "../handlers/auth-handlers.js";
import { isOptionalAuthorized } from "../middlewares/isAuthorized.js";

const authHandlers = new AuthHandlers();
const authRoutes = factory.createApp();

authRoutes.post("/register", isOptionalAuthorized, authHandlers.createUserHandlers);
authRoutes.post("/signup-email", authHandlers.signInWithEmailHandlers);

export default authRoutes;
