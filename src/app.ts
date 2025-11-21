import { cors } from "hono/cors";

import { OK } from "./constants/http-status-codes.js";
import envData from "./env.js";
import { sendResponse } from "./utils/send-response.js";
import { SERVICE_UP } from "./constants/app-constants.js";
import notFound from "./utils/not-found.js";
import factory from "./factory.js";
import onError from "./utils/on-error.js";

const appVersion = envData.API_VERSION;

const app = factory.createApp().basePath(`v${appVersion}`);

app.use("*", cors());

app.get("/", (c) => {
  return sendResponse(c, OK, SERVICE_UP);
});


app.get("/error", (c) => {
  c.status(422);
  throw new Error("Test error");
});

app.notFound(notFound);
app.onError(onError);

export default app;
