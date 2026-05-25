import factory from "../factory.js";
import { UserHandlers } from "../handlers/user-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const userHandlers = new UserHandlers();
const userRoutes = factory.createApp();

userRoutes.get("/basic", isAuthorized, userHandlers.usersBasicListHandler);
userRoutes.get("/profile", isAuthorized, userHandlers.userProfileHandler);
userRoutes.get("/:id/details", isAuthorized, userHandlers.userDetailsWithLocationsHandler);
userRoutes.patch("/:id", isAuthorized, userHandlers.updateUserDetailsHandler);
// isAuthorized (not isSuperAdminOrAdmin): any authenticated user can delete their own account;
// handler enforces admin-only rules when deleting a different account.
userRoutes.delete("/:id", isAuthorized, userHandlers.deleteUserHandler);
userRoutes.get("/", isAuthorized, userHandlers.listUsersHandler);
userRoutes.post("/:id/log-out", userHandlers.userLogOutHandler);


export default userRoutes;
