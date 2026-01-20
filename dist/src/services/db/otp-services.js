import { and, desc, eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { otps } from "../../database/schemas/otp.js";
import { users } from "../../database/schemas/users.js";
import { updateRecordByIdWithTrx } from "./base-db-services.js";
export class OtpService {
    createOTP = async (otpData) => {
        otpData.expires_at = otpData.expires_at;
        const otp = await db.insert(otps).values(otpData);
        return otp;
    };
    fetchOtp = async (data) => {
        const otpData = await db
            .select()
            .from(otps)
            .where(and(eq(otps.phone, data.phone), eq(otps.is_verified, false)))
            .limit(1)
            .orderBy(desc(otps.created_at));
        return otpData;
    };
    verifyOtpAndUpdateUser = async (otpId, userId) => {
        return await db.transaction(async (trx) => {
            await updateRecordByIdWithTrx(otps, otpId, { is_verified: true }, trx);
            const updatedUser = await updateRecordByIdWithTrx(users, userId, { user_verified: true }, trx);
            return updatedUser;
        });
    };
}
