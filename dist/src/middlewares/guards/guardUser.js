import { createMiddleware } from "hono/factory";
import { FORBIDDEN } from "../../constants/http-status-phrases.js";
import ForbiddenException from "../../exceptions/forbidden-exception.js";
import { getUserDetailsFromToken } from "../../utils/jwt-utils.js";
const isAdmin = createMiddleware(async (c, next) => {
    const userPayload = await getUserDetailsFromToken(c);
    if (userPayload.user_type === "ADMIN") {
        await next();
    }
    else {
        throw new ForbiddenException(FORBIDDEN);
    }
});
const isOwner = createMiddleware(async (c, next) => {
    const userPayload = await getUserDetailsFromToken(c);
    if (userPayload.user_type === "USER") {
        await next();
    }
    else {
        throw new ForbiddenException(FORBIDDEN);
    }
});
const isOwnerOrManager = createMiddleware(async (c, next) => {
    const userPayload = await getUserDetailsFromToken(c);
    if (userPayload.user_type === "USER") {
        await next();
    }
    else {
        throw new ForbiddenException(FORBIDDEN);
    }
});
const isOwnerOrAdmin = createMiddleware(async (c, next) => {
    const userPayload = await getUserDetailsFromToken(c);
    if (userPayload.user_type === "USER" || userPayload.user_type === "ADMIN") {
        await next();
    }
    else {
        throw new ForbiddenException(FORBIDDEN);
    }
});
const isOwnerOrAdminOrManager = createMiddleware(async (c, next) => {
    const userPayload = await getUserDetailsFromToken(c);
    if (userPayload.user_type === "USER" || userPayload.user_type === "ADMIN") {
        await next();
    }
    else {
        throw new ForbiddenException(FORBIDDEN);
    }
});
export { isAdmin, isOwner, isOwnerOrAdmin, isOwnerOrAdminOrManager, isOwnerOrManager };
