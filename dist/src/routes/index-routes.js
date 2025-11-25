import { Hono } from "hono";
import authRoutes from "./auth-routes.js";
const indexRoute = new Hono();
indexRoute.route("/auth", authRoutes);
export default indexRoute;
