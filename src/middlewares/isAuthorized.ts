import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getUserDetailsFromToken } from "../utils/jwt-utils.js";
import { getSingleRecordByMultipleColumnValues } from "../services/db/base-db-services.js";
import { users } from "../database/schemas/users.js";
import ForbiddenException from "../exceptions/forbidden-exception.js";
import { FORBIDDEN } from "../constants/http-status-phrases.js";

async function resolvePayloads(c: Context) {
  const userDetails = await getUserDetailsFromToken(c);

  if (userDetails.user_type === "SUB_USER" && userDetails.parent_id) {
    const parent = await getSingleRecordByMultipleColumnValues(
      users, ["id", "status"], ["=", "!="], [userDetails.parent_id, "ARCHIVED"],
    );
    if (!parent) throw new ForbiddenException(FORBIDDEN);
    const { password: _p, ...parentDetails } = parent;
    c.set("sub_user_payload", userDetails);
    c.set("user_payload", parentDetails);
    c.set("performer_id", userDetails.id);
  } else {
    c.set("user_payload", userDetails);
    c.set("performer_id", userDetails.id);
  }
}

const isAuthorized = createMiddleware(async (c: Context, next) => {
  await resolvePayloads(c);
  await next();
});

const isOptionalAuthorized = createMiddleware(async (c: Context, next) => {
  const isPublic = c.req.query("is_public") || "false";
  if (isPublic === "true") {
    await next();
  } else {
    await resolvePayloads(c);
    await next();
  }
});

export { isAuthorized, isOptionalAuthorized };
