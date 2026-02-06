import factory from "../factory.js";
import { SyncParamsDataHandlers } from "../handlers/sync-params-data-handlers.js";
const syncParamsDataHandlers = new SyncParamsDataHandlers();
const syncDataRoutes = factory.createApp();

syncDataRoutes.get("/", syncParamsDataHandlers.syncParamsData);

export default syncDataRoutes;