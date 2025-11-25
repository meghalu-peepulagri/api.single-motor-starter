import factory from "../factory.js";
import { AuthHandlers } from "../handlers/auth-handlers.js";
const authHandlers = new AuthHandlers();
const authRoutes = factory.createApp();
authRoutes.post("/register", authHandlers.createUserHandlers);
export default authRoutes;
