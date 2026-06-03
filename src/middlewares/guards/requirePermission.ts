import { createMiddleware } from "hono/factory";
import ForbiddenException from "../../exceptions/forbidden-exception.js";
import { FORBIDDEN } from "../../constants/http-status-phrases.js";
import { getSubUserPermissions } from "../../services/db/sub-user-services.js";

export const requirePermission = (permKey: string) =>
  createMiddleware(async (c, next) => {
    const subUser = c.get("sub_user_payload");

    // not a sub-user — pass freely
    if (!subUser) return await next();

    const permissions = await getSubUserPermissions(subUser.id);
    if (!permissions.includes(permKey)) throw new ForbiddenException(FORBIDDEN);

    await next();
  });
