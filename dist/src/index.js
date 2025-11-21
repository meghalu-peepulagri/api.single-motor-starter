import { serve } from "@hono/node-server";
import app from "./app.js";
import env from "./env.js";
// import mqttServiceInstance from "./services/mqtt-services.js";
const port = env.PORT;
serve({
    fetch: app.fetch,
    port,
});
// eslint-disable-next-line no-console
console.log(`Server is running on port ${port}`);
// mqttServiceInstance.connect();
