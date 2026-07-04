import { Hono } from "hono";
import { runScheduleSync } from "../helpers/schedule-sync-helper.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/send-response.js";

const cronRoutes = new Hono();

// Upstash cron: 22:00 IST (16:30 UTC) — pre-load next-day schedules before midnight
cronRoutes.post("/schedule-sync-evening", async (c) => {
  runScheduleSync("evening-cron").catch(err =>
    logger.error(`[cron:evening] ${(err as Error)?.message}`)
  );
  return sendResponse(c, 200, "Evening schedule sync triggered");
});

// Upstash cron: 00:15 IST (18:45 UTC) — advance window after midnight
cronRoutes.post("/schedule-sync-midnight", async (c) => {
  runScheduleSync("midnight-cron").catch(err =>
    logger.error(`[cron:midnight] ${(err as Error)?.message}`)
  );
  return sendResponse(c, 200, "Midnight schedule sync triggered");
});

export default cronRoutes;
