import factory from "../factory.js";
import { MotorHandlers } from "../handlers/motor-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorHandlers = new MotorHandlers();
const motorRoutes = factory.createApp();

motorRoutes.post("/", isAuthorized, motorHandlers.addMotorHandler);
motorRoutes.get("/", isAuthorized, motorHandlers.getAllMotorsHandler);
motorRoutes.get("/:id", isAuthorized, motorHandlers.getSingleMotorHandler);
motorRoutes.patch("/:id", isAuthorized, motorHandlers.updateMotorHandler);
motorRoutes.delete("/:id", isAuthorized, motorHandlers.deleteMotorHandler);
motorRoutes.patch("/:id/test-run-status", isAuthorized, motorHandlers.updateMotorTestRunStatusHandler);
motorRoutes.patch("/:id/assign", isAuthorized, motorHandlers.assignMotorHandler);
motorRoutes.patch("/:id/detach", isAuthorized, motorHandlers.detachMotorHandler);
motorRoutes.patch("/:id/replace", isAuthorized, motorHandlers.replaceMotorHandler);

export default motorRoutes;