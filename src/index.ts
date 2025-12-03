import { serve } from "@hono/node-server";
import "dotenv/config";
import app from "./app.js";
import appData from "./config/app-config.js";
import { mqttConnect } from "./services/mqtt-service.js";


const port = Number(appData.port) || 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on port ${port}`);
mqttConnect();