import { sign, verify } from "hono/jwt";
import { JwtTokenExpired, JwtTokenInvalid, JwtTokenSignatureMismatched } from "hono/utils/jwt/types";
import { jwtConfig } from "../config/jwt-config.js";
import { TOKEN_EXPIRED, TOKEN_REQUIRED, TOKEN_SIGNATURE_MISMATCH, USER_INACTIVE } from "../constants/app-constants.js";
import { users } from "../database/schemas/users.js";
import ForbiddenException from "../exceptions/forbidden-exception.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import { getSingleRecordByMultipleColumnValues } from "../services/db/base-db-services.js";
async function genJWTTokens(payload) {
    const access_token_expiry = Math.floor(Date.now() / 1000) + jwtConfig.expires_in;
    const access_token_payload = {
        ...payload,
        exp: access_token_expiry,
    };
    const refresh_token_payload = {
        ...payload,
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30), // 30 days
    };
    const access_token = await sign(access_token_payload, jwtConfig.secret);
    const refresh_token = await sign(refresh_token_payload, jwtConfig.secret);
    return {
        access_token,
        refresh_token,
        refresh_token_expires_at: refresh_token_payload.exp,
    };
}
async function genJWTTokensForUser(userId) {
    const payload = {
        sub: userId,
        iat: Math.floor(Date.now() / 1000) - 5,
    };
    return await genJWTTokens(payload);
}
async function verifyJWTToken(token) {
    try {
        const decodedPayload = await verify(token, jwtConfig.secret);
        return decodedPayload;
    }
    catch (error) {
        if (error instanceof JwtTokenInvalid) {
            throw new UnauthorizedException(TOKEN_REQUIRED);
        }
        if (error instanceof JwtTokenExpired) {
            throw new UnauthorizedException(TOKEN_EXPIRED);
        }
        if (error instanceof JwtTokenSignatureMismatched) {
            throw new UnauthorizedException(TOKEN_SIGNATURE_MISMATCH);
        }
        throw error;
    }
}
async function getUserDetailsFromToken(c) {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.substring(7, authHeader.length);
    if (!token) {
        throw new UnauthorizedException(TOKEN_REQUIRED);
    }
    const decodedPayload = await verifyJWTToken(token);
    const user = await getSingleRecordByMultipleColumnValues(users, ["id", "status"], ["=", "!="], [decodedPayload.sub, "ARCHIVED"]);
    if (!user)
        throw new ForbiddenException(USER_INACTIVE);
    const { created_at, updated_at, ...userDetails } = user;
    return userDetails;
}
export { genJWTTokens, genJWTTokensForUser, getUserDetailsFromToken, verifyJWTToken };
