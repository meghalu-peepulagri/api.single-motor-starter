import type { Context, Next } from "hono";
import { logger } from "../utils/logger.js";

/**
 * Custom API Logger Middleware
 * Integrates Hono requests with our custom logging system
 */
export const apiLogger = async (c: Context, next: Next) => {
  const { method, path } = c.req;
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Log to our custom logger
  logger.api(`${method} ${path} ${status} - ${duration}ms`, {
    method,
    path,
    status,
    duration: `${duration}ms`,
    ip: c.req.header("x-forwarded-for") || c.req.header("host"),
  });
};
