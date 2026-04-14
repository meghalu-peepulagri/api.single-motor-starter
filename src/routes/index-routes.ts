import { Hono } from "hono";
import authRoutes from "./auth-routes.js";
import bridgeRoutes from "./bridge-routes.js";
import fieldRoutes from "./field-routes.js";
import locationRoutes from "./location-routes.js";
import motorRoutes from "./motor-routes.js";
import motorSchedulesRoutes from "./motor-schedules-routes.js";
import starterRoutes from "./starter-routes.js";
import userRoutes from "./user-routes.js";
import settingsRoutes from "./settings-routes.js";
import activityRoutes from "./activities.js";
import analyticsRoutes from "./analytics-routes.js";
import starterDispatchRoutes from "./starter-dispatch-routes.js";
import syncDataRoutes from "./sync-routes.js";
import gatewayRoutes from "./gateway-routes.js";

const indexRoute = new Hono();

indexRoute.route("/auth", authRoutes);
indexRoute.route("/users", userRoutes);
indexRoute.route("/locations", locationRoutes);
indexRoute.route("/activities", activityRoutes);
indexRoute.route("/fields", fieldRoutes);
indexRoute.route("/motors", motorRoutes);
indexRoute.route("/starters", starterRoutes);
indexRoute.route("/motor-schedules", motorSchedulesRoutes);
indexRoute.route("/settings", settingsRoutes);
indexRoute.route("/analytics", analyticsRoutes);
indexRoute.route("/sync-data", syncDataRoutes);
indexRoute.route("/bridge", bridgeRoutes);
indexRoute.route("/starter-dispatch", starterDispatchRoutes);
indexRoute.route("/gateways", gatewayRoutes);

export default indexRoute;
