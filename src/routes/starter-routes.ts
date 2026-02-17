import factory from "../factory.js";
import { StarterHandlers } from "../handlers/starter-handlers.js";
import { isSuperAdminOrAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const starterHandlers = new StarterHandlers();
const starterRoutes = factory.createApp();

starterRoutes.post("/", isAuthorized, starterHandlers.addStarterBoxHandler);

starterRoutes.get("/mobile", isAuthorized, starterHandlers.starterListMobileHandler);
starterRoutes.get("/web/all", isAuthorized, isSuperAdminOrAdmin, starterHandlers.starterListWebHandler);
starterRoutes.get("/dashboard-counts", isAuthorized, starterHandlers.starterCountBasedOnStatusHandler);

starterRoutes.patch("/assign", isAuthorized, starterHandlers.assignStarterMobileHandler);
starterRoutes.patch("/assign-web", isAuthorized, starterHandlers.assignStarterWebHandler);
starterRoutes.patch("/assign-location", isAuthorized, starterHandlers.assignLocationToStarterHandler);
starterRoutes.patch("/replace", isAuthorized, starterHandlers.replaceStarterLocationHandler);
starterRoutes.patch("/update-status", starterHandlers.markStarterStatusHandler);
starterRoutes.get("/latest-pcb-number", isAuthorized, starterHandlers.getLatestPcbNumberHandler);

starterRoutes.get("/:id/run-time", isAuthorized, starterHandlers.starterRunTimeHandler);
starterRoutes.get("/:id/analytics", isAuthorized, starterHandlers.starterAnalyticsHandler);
starterRoutes.get("/:id/motors", isAuthorized, starterHandlers.starterConnectedMotorsHandler);
starterRoutes.get("/:id/temperature", isAuthorized, starterHandlers.getTemperatureHandler);
starterRoutes.get("/:starter_id/motors/:motor_id/alerts-faults", isAuthorized, starterHandlers.getConsecutiveAlertsFaultsHandler);
starterRoutes.patch("/:id/deploy-status", isAuthorized, starterHandlers.updateDeployStatusHandler);
starterRoutes.patch("/:id/details", isAuthorized, starterHandlers.updateStarterDetailsHandler);
starterRoutes.patch("/:id/allocation", isAuthorized, starterHandlers.updateDeviceAllocationHandler);
starterRoutes.patch("/:id/settings-sync", isAuthorized, starterHandlers.updateSettingsSyncStatusHandler);
starterRoutes.patch("/:id/reset", isAuthorized, starterHandlers.deviceResetHandler);

starterRoutes.patch("/:id", isAuthorized, starterHandlers.deleteStarterBoxHandler);


export default starterRoutes;