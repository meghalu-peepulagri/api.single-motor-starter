import factory from "../factory.js";
import { MotorScheduleHandler } from "../handlers/motor-scheduling-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const motorScheduleHandler = new MotorScheduleHandler();
const motorScheduleRoute = factory.createApp();

// =================== GET ROUTES ===================

// Pending schedules for device sync (no auth)
motorScheduleRoute.get("/sync/pending", motorScheduleHandler.getPendingSchedulesForSyncHandler);

// Schedule history by motor_id and starter_id (?motor_id=&starter_id=&page=&limit=)
motorScheduleRoute.get("/history", isAuthorized, motorScheduleHandler.getScheduleHistoryHandler);

// List schedules with filters (?starter_id=&motor_id=&status=&page=&limit=)
motorScheduleRoute.get("/", isAuthorized, motorScheduleHandler.motorScheduleListHandler);

// Get single schedule by id
motorScheduleRoute.get("/:id", isAuthorized, motorScheduleHandler.getMotorScheduleByIdHandler);

// Get timeline history for a single schedule
motorScheduleRoute.get("/:id/history", isAuthorized, motorScheduleHandler.getScheduleHistoryByIdHandler);

// Get full lifecycle audit trail for a schedule
motorScheduleRoute.get("/:id/logs", isAuthorized, motorScheduleHandler.getScheduleLogsHandler);

// Get latest device live data snapshot for a schedule
motorScheduleRoute.get("/:id/live-data", isAuthorized, motorScheduleHandler.getScheduleLiveDataHandler);

// Get all MQTT operations dispatched for a schedule
motorScheduleRoute.get("/:id/operations", isAuthorized, motorScheduleHandler.getScheduleOperationsHandler);


// =================== POST ROUTES ===================

// Cron: evaluate and update schedule statuses based on current time (no auth)
motorScheduleRoute.post("/sync/status", motorScheduleHandler.syncScheduleStatusesHandler);

// Stop all active schedules for a motor
motorScheduleRoute.post("/stop-all/:motor_id", isAuthorized, motorScheduleHandler.stopAllMotorSchedulesHandler);

// Update schedule status: cmd 1 = Stop, cmd 2 = Restart
motorScheduleRoute.post("/update-status/:id", isAuthorized, motorScheduleHandler.updateScheduleStatusHandler);

// Force-push stuck PENDING schedules to device (bypasses anchor check and date window)
motorScheduleRoute.post("/republish", isAuthorized, motorScheduleHandler.republishSchedulesHandler);

// Create a single or bulk schedules
motorScheduleRoute.post("/", isAuthorized, motorScheduleHandler.createMotorScheduleHandler);


// Bulk stop schedules by ids
motorScheduleRoute.post("/bulk/stop", isAuthorized, motorScheduleHandler. bulkStopSchedulesHandler);

// Bulk restart schedules by ids
motorScheduleRoute.post("/bulk/restart", isAuthorized, motorScheduleHandler.bulkRestartSchedulesHandler);

// Bulk delete schedules by ids
motorScheduleRoute.delete("/bulk", isAuthorized, motorScheduleHandler.bulkDeleteSchedulesHandler);


// =================== PATCH ROUTES ===================

// Bulk Ack schedules
motorScheduleRoute.patch("/bulk/ack", isAuthorized, motorScheduleHandler.bulkUpdateAcknowledgementHandler);

// Add repeat days to an existing schedule
motorScheduleRoute.patch("/repeat-days/:id", isAuthorized, motorScheduleHandler.addRepeatDaysHandler);

// Per-day stop / restart / delete  { action: "stop"|"restart"|"delete", day: 0-6 }
motorScheduleRoute.patch("/:id/days", isAuthorized, motorScheduleHandler.updateDayBitmaskHandler);

// Ack schedule (mark as acknowledged)
motorScheduleRoute.patch("/:id/ack", isAuthorized, motorScheduleHandler.updateAcknowledgementHandler);

// Update a schedule
motorScheduleRoute.patch("/:id", isAuthorized, motorScheduleHandler.editMotorScheduleHandler);


// =================== DELETE ROUTES ===================

// Delete a schedule
motorScheduleRoute.delete("/:id", isAuthorized, motorScheduleHandler.deleteMotorScheduleHandler);

export default motorScheduleRoute;
