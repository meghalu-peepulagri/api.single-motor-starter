import factory from "../factory.js";
import { MotorScheduleHandler } from "../handlers/motor-scheduling-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorScheduleHandler = new MotorScheduleHandler();
const motorScheduleRoute = factory.createApp();

// Stop all active schedules for a motor
motorScheduleRoute.post("/stop-all/:motor_id", isAuthorized, motorScheduleHandler.stopAllMotorSchedulesHandler);

// Stop a single active schedule
motorScheduleRoute.post("/stop/:id", isAuthorized, motorScheduleHandler.stopMotorScheduleHandler);

// Restart a schedule
motorScheduleRoute.post("/restart/:id", isAuthorized, motorScheduleHandler.restartMotorScheduleHandler);

// Add repeat days to an existing schedule
motorScheduleRoute.patch("/repeat-days/:id", isAuthorized, motorScheduleHandler.addRepeatDaysHandler);

// List schedules with filters (?starter_id=&motor_id=&status=&page=&limit=)
motorScheduleRoute.get("/", isAuthorized, motorScheduleHandler.motorScheduleListHandler);

// Get single schedule by id
motorScheduleRoute.get("/:id", isAuthorized, motorScheduleHandler.getMotorScheduleByIdHandler);

// Update a schedule
motorScheduleRoute.patch("/:id", isAuthorized, motorScheduleHandler.editMotorScheduleHandler);

// Delete a schedule
motorScheduleRoute.delete("/:id", isAuthorized, motorScheduleHandler.deleteMotorScheduleHandler);

// Create a single schedule
motorScheduleRoute.post("/", isAuthorized, motorScheduleHandler.createMotorScheduleHandler);

// Ack schedule (mark as acknowledged)
motorScheduleRoute.patch("/:id/ack", isAuthorized, motorScheduleHandler.updateAcknowledgementHandler);

export default motorScheduleRoute;
