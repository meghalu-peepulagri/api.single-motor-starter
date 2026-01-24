
import factory from "../factory.js";
import { MotorScheduleHandler } from "../handlers/motor-scheduling-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";



const motorScheduleHandler = new MotorScheduleHandler();
const motorScheduleRoute = factory.createApp();

motorScheduleRoute.post("/pond", isAuthorized, motorScheduleHandler.createMotorScheduleForPondHandler);
motorScheduleRoute.get("/:motor_id", isAuthorized, motorScheduleHandler.motorScheduleListHandler);
motorScheduleRoute.patch("/:id", isAuthorized, motorScheduleHandler.editMotorScheduleHandler);
motorScheduleRoute.delete("/:id", isAuthorized, motorScheduleHandler.deleteMotorScheduleHandler);
motorScheduleRoute.post("/", isAuthorized, motorScheduleHandler.createMotorScheduleHandler);

export default motorScheduleRoute;
