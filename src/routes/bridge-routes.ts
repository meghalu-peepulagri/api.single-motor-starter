import factory from "../factory.js";
import { BridgeHandlers } from "../handlers/bridge-handlers.js";

const bridgeHandlers = new BridgeHandlers();
const bridgeRoutes = factory.createApp();

bridgeRoutes.post("/run", bridgeHandlers.triggerAndWaitHandler);

export default bridgeRoutes;
