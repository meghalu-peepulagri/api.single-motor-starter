import factory from "../factory.js";
import { AuthHandlers } from "../handlers/auth-handlers.js";
import { isOptionalAuthorized } from "../middlewares/isAuthorized.js";

const authHandlers = new AuthHandlers();
const authRoutes = factory.createApp();

authRoutes.post("/register", isOptionalAuthorized, authHandlers.userRegisterHandler);
authRoutes.post("/signin-email", authHandlers.signInWithEmailHandler);
authRoutes.post("/signin-phone", authHandlers.signInWithPhoneHandler);
authRoutes.post("/verify-otp", authHandlers.verifyOtpHandler);

export default authRoutes;
