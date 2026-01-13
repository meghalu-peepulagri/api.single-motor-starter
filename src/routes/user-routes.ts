import factory from "../factory.js";
import { UserHandlers } from "../handlers/user-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const userHandlers = new UserHandlers();
const userRoutes = factory.createApp();

userRoutes.get("/basic", isAuthorized, userHandlers.usersBasicListHandler);
userRoutes.get("/profile", isAuthorized, userHandlers.userProfileHandler);
userRoutes.patch("/:id", isAuthorized, userHandlers.updateUserDetailsHandler);
userRoutes.get("/", isAuthorized, userHandlers.listUsersHandler);

export default userRoutes;
