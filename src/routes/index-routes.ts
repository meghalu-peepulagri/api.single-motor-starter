import { Hono } from "hono";
import authRoutes from "./auth-routes.js";
import userRoutes from "./user-routes.js";


const indexRoute = new Hono();

indexRoute.route("/auth", authRoutes);
indexRoute.route("/users", userRoutes);


export default indexRoute;