import { serve } from "@hono/node-server";

import app from "./app.js";
import { config } from "dotenv";
import appData from "./config/app-config.js";
// import mqttServiceInstance from "./services/mqtt-services.js";

const port = Number(appData.api_version) || 3000;

serve({
  fetch: app.fetch,
  port,
});

// eslint-disable-next-line no-console
console.log(`Server is running on port ${port}`);
// mqttServiceInstance.connect();
