import { createMiddleware } from "hono/factory";
import { getUserDetailsFromToken } from "../utils/jwt-utils.js";
const isAuthorized = createMiddleware(async (c, next) => {
    const userDetails = await getUserDetailsFromToken(c);
    c.set("user_payload", userDetails);
    await next();
});
const isOptionalAuthorized = createMiddleware(async (c, next) => {
    const isPublic = c.req.query("is_public") || "false";
    if (isPublic && isPublic === "true") {
        await next();
    }
    else {
        const userDetails = await getUserDetailsFromToken(c);
        c.set("user_payload", userDetails);
        await next();
    }
});
export { isAuthorized, isOptionalAuthorized };
