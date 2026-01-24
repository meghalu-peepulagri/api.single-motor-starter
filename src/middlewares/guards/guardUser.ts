import type { Context } from "hono";

import { createMiddleware } from "hono/factory";
import { FORBIDDEN } from "../../constants/http-status-phrases.js";
import ForbiddenException from "../../exceptions/forbidden-exception.js";
import { getUserDetailsFromToken } from "../../utils/jwt-utils.js";


const isAdmin = createMiddleware(async (c: Context, next) => {
  const userPayload = await getUserDetailsFromToken(c);
  if (userPayload.user_type === "ADMIN") {
    await next();
  }
  else {
    throw new ForbiddenException(FORBIDDEN);
  }
});

const isUser = createMiddleware(async (c: Context, next) => {
  const userPayload = await getUserDetailsFromToken(c);
  if (userPayload.user_type === "USER") {
    await next();
  }
  else {
    throw new ForbiddenException(FORBIDDEN);
  }
});


const isUserOrAdmin = createMiddleware(async (c: Context, next) => {
  const userPayload = await getUserDetailsFromToken(c);
  if (userPayload.user_type === "USER" || userPayload.user_type === "ADMIN") {
    await next();
  }
  else { throw new ForbiddenException(FORBIDDEN); }
});


export {
  isAdmin,
  isUser,
  isUserOrAdmin
};

