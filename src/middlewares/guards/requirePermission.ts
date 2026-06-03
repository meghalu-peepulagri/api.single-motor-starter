import { createMiddleware } from "hono/factory";
import ForbiddenException from "../../exceptions/forbidden-exception.js";
import { FORBIDDEN } from "../../constants/http-status-phrases.js";
import { getSubUserPermissions } from "../../services/db/sub-user-services.js";

export const requirePermission = (permKey: string) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user_payload");

    if (user.user_type !== "SUB_USER") return await next();

    if (!user.parent_id) throw new ForbiddenException(FORBIDDEN);

    const permissions = await getSubUserPermissions(user.id, user.parent_id);
    if (!permissions.includes(permKey)) throw new ForbiddenException(FORBIDDEN);

    await next();
  });
