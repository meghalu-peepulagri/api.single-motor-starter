import factory from "../factory.js";
import { UserHandlers } from "../handlers/user-handlers.js";
import { isAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const userHandlers = new UserHandlers();
const userRoutes = factory.createApp();

userRoutes.get("/basic", isAuthorized, userHandlers.usersBasicList);
userRoutes.get("/profile", isAuthorized, userHandlers.userProfile);
userRoutes.patch("/:id", isAuthorized, userHandlers.updateUserDetails);
userRoutes.get("/", isAuthorized, isAdmin, userHandlers.list);

export default userRoutes;
