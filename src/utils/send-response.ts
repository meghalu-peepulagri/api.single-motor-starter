import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { IRespWithData } from "../types/app-types.js";



export function sendResponse(c: Context, status: ContentfulStatusCode, message: string, data?: unknown) {
  const respData: IRespWithData = {
    status,
    success: true,
    message,
    data: data ?? null,
  };
  return c.json(respData, status);
}
