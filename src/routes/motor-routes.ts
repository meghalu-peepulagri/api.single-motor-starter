import factory from "../factory.js";
import { MotorHandlers } from "../handlers/motor-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorHandlers = new MotorHandlers();
const motorRoutes = factory.createApp();

motorRoutes.post("/", isAuthorized, motorHandlers.addMotor);

export default motorRoutes;
