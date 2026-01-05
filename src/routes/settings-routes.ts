
import factory from "../factory.js";
import { StarterDefaultSettingsHandlers } from "../handlers/starter-default-settings-handlers.js";
import { isAdmin } from "../middlewares/guards/guardUser.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const settingsHandlers = new StarterDefaultSettingsHandlers();
const settingsRoutes = factory.createApp();

settingsRoutes.get("/default", isAuthorized, isAdmin, settingsHandlers.getStarterDefaultSettings);
settingsRoutes.patch("/default/:id", isAuthorized, isAdmin, settingsHandlers.updateStarterDefaultSettings);
settingsRoutes.get("/starter/:starter_id", isAuthorized, settingsHandlers.getAcknowledgedStarterSettings);
settingsRoutes.post("/starter/:starter_id", isAuthorized, settingsHandlers.insertStarterSetting);
export default settingsRoutes;