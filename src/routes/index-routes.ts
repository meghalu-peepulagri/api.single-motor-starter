import { Hono } from "hono";
import authRoutes from "./auth-routes.js";
import fieldRoutes from "./field-routes.js";
import locationRoutes from "./location-routes.js";
import motorRoutes from "./motor-routes.js";
import motorSchedulesRoutes from "./motor-schedules-routes.js";
import starterRoutes from "./starter-routes.js";
import userActivitiesRoutes from "./user-activities.js";
import userRoutes from "./user-routes.js";


const indexRoute = new Hono();

indexRoute.route("/auth", authRoutes);
indexRoute.route("/users", userRoutes);
indexRoute.route("/locations", locationRoutes);
indexRoute.route("/users-activities", userActivitiesRoutes);
indexRoute.route("/fields", fieldRoutes);
indexRoute.route("/motors", motorRoutes);
indexRoute.route("/starters", starterRoutes);
indexRoute.route("/Motor-schedules", motorSchedulesRoutes);

export default indexRoute;