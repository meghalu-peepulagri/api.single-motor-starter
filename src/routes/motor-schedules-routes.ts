import factory from "../factory.js";
import { MotorScheduleHandler } from "../handlers/motor-scheduling-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorScheduleHandler = new MotorScheduleHandler();
const motorScheduleRoute = factory.createApp();

// =================== GET ROUTES ===================

// Pending schedules for device sync (no auth)
motorScheduleRoute.get("/sync/pending", motorScheduleHandler.getPendingSchedulesForSyncHandler);

// List schedules with filters (?starter_id=&motor_id=&status=&page=&limit=)
motorScheduleRoute.get("/", isAuthorized, motorScheduleHandler.motorScheduleListHandler);

// Get single schedule by id
motorScheduleRoute.get("/:id", isAuthorized, motorScheduleHandler.getMotorScheduleByIdHandler);


// =================== POST ROUTES ===================

// Cron: evaluate and update schedule statuses based on current time (no auth)
motorScheduleRoute.post("/sync/status", motorScheduleHandler.syncScheduleStatusesHandler);

// Stop all active schedules for a motor
motorScheduleRoute.post("/stop-all/:motor_id", isAuthorized, motorScheduleHandler.stopAllMotorSchedulesHandler);

// Update schedule status: cmd 1 = Stop, cmd 2 = Restart
motorScheduleRoute.post("/update-status/:id", isAuthorized, motorScheduleHandler.updateScheduleStatusHandler);

// Create a single or bulk schedules
motorScheduleRoute.post("/", isAuthorized, motorScheduleHandler.createMotorScheduleHandler);


// =================== PATCH ROUTES ===================

// Bulk Ack schedules
motorScheduleRoute.patch("/bulk/ack", isAuthorized, motorScheduleHandler.bulkUpdateAcknowledgementHandler);

// Add repeat days to an existing schedule
motorScheduleRoute.patch("/repeat-days/:id", isAuthorized, motorScheduleHandler.addRepeatDaysHandler);

// Ack schedule (mark as acknowledged)
motorScheduleRoute.patch("/:id/ack", isAuthorized, motorScheduleHandler.updateAcknowledgementHandler);

// Update a schedule
motorScheduleRoute.patch("/:id", isAuthorized, motorScheduleHandler.editMotorScheduleHandler);


// =================== DELETE ROUTES ===================

// Delete a schedule
motorScheduleRoute.delete("/:id", isAuthorized, motorScheduleHandler.deleteMotorScheduleHandler);

export default motorScheduleRoute;
