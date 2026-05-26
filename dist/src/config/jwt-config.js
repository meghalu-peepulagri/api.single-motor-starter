import envData from "../env.js";
export const jwtConfig = {
    secret: envData.JWT_SECRET,
    expires_in: 60 * 60 * 24 * 10, // 10 days
};
