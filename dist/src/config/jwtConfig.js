import envData from "../env.js";
export const jwtConfig = {
    secret: envData.JWT_SECRET,
    expires_in: 60 * 60 * 24 * 30, // 30 days
};
