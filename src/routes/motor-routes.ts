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
// Add a second motor to an existing single-motor box, converting it to dual motor.
// Registered before the /control and /mode routes for readability only — the paths differ.
motorRoutes.post("/starter/:starterId", isAuthorized, motorHandlers.addMotorToStarterHandler);
motorRoutes.post("/starter/:starterId/control", isAuthorized, motorHandlers.controlMotorsHandler);
motorRoutes.post("/starter/:starterId/mode", isAuthorized, motorHandlers.controlMotorsModeHandler);


export default motorRoutes;