import { Hono } from "hono";
import authRoutes from "./auth-routes.js";
import userRoutes from "./user-routes.js";
import locationRoutes from "./location-routes.js";
const indexRoute = new Hono();
indexRoute.route("/auth", authRoutes);
indexRoute.route("/users", userRoutes);
indexRoute.route("/locations", locationRoutes);
export default indexRoute;
