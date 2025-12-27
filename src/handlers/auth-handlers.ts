import argon2 from "argon2";
import type { Context } from "hono";
import moment from "moment";
import { INVALID_CREDENTIALS, INVALID_OTP, LOGIN_DONE, LOGIN_VALIDATION_CRITERIA, OTP_SENT, SIGNUP_VALIDATION_CRITERIA, USER_CREATED, USER_LOGIN, USER_NOT_EXIST_WITH_PHONE, VERIFY_OTP_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { CREATED } from "../constants/http-status-codes.js";
import db from "../database/configuration.js";
import { deviceTokens, type DeviceTokensTable } from "../database/schemas/device-tokens.js";
import { type NewOtp } from "../database/schemas/otp.js";
import { userActivityLogs, type NewUserActivityLog } from "../database/schemas/user-activity-logs.js";
import { users, type NewUser, type UsersTable } from "../database/schemas/users.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
import { prepareOTPData } from "../helpers/otp-helper.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord } from "../services/db/base-db-services.js";
import { OtpService } from "../services/db/otp-service.js";
import { SmsService } from "../services/sms/sms-service.js";
import { genJWTTokensForUser } from "../utils/jwt-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedSignInEmail, ValidatedSignInPhone, ValidatedSignUpUser, ValidatedVerifyOtp } from "../validations/schema/user-validations.js";
import { validatedRequest } from "../validations/validate-request.js";

const paramsValidateException = new ParamsValidateException();
const otpService = new OtpService();
const smsService = new SmsService();

export class AuthHandlers {
    userRegisterHandlers = async (c: Context) => {
        try {
            const userPayload = c.get("user_payload");
            const reqBody = await c.req.json();

            paramsValidateException.emptyBodyValidation(reqBody);

            const validUserReq = await validatedRequest<ValidatedSignUpUser>("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);

            const hashedPassword = validUserReq.password ? await argon2.hash(validUserReq.password) : await argon2.hash("i@123456");

            const isAdmin = userPayload?.user_type === "ADMIN";
            const user_verified = isAdmin ? true : false;

            const userData: NewUser = {
                ...validUserReq,
                password: hashedPassword,
                user_verified,
                created_by: userPayload ? userPayload.id : null,
                notifications_enabled: ["STATE", "MODE", "ALERTS-FAULTS"],
            };

            let createdUser: any;

            await db.transaction(async (trx) => {
                createdUser = await saveSingleRecord<UsersTable>(users, userData, trx);
                if (!createdUser) return;

                const logData: NewUserActivityLog = {
                    user_id: Number(createdUser.id),
                    action: "REGISTERED",
                    performed_by: userPayload?.id ?? Number(createdUser.id),
                    old_data: null,
                    new_data: null,
                };

                await saveSingleRecord(userActivityLogs, logData, trx);
            });

            if (!userPayload && createdUser) {
                const phone = createdUser.phone;
                const otpData = prepareOTPData(createdUser, phone, "REGISTERED");
                await otpService.createOTP(otpData);
                await smsService.sendSms(phone, otpData.otp);
            }

            return sendResponse(c, CREATED, USER_CREATED);
        } catch (error: any) {
            console.error("Error at register user :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };

    signInWithEmailHandlers = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest<ValidatedSignInEmail>("signin-email", reqBody, LOGIN_VALIDATION_CRITERIA);

            const loginUser = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["email", "status"], ["LOWER", "!="], [validUserReq.email.toLowerCase(), "ARCHIVED"]);
            if (!loginUser || !loginUser.password) throw new UnauthorizedException(INVALID_CREDENTIALS);

            const isPasswordMatched = await argon2.verify(loginUser.password, validUserReq.password);
            if (!isPasswordMatched) throw new UnauthorizedException(INVALID_CREDENTIALS);

            const { access_token, refresh_token } = await genJWTTokensForUser(loginUser.id);
            const { password, ...userWithoutPassword } = loginUser;

            const response = { user_details: userWithoutPassword, access_token, refresh_token };
            return sendResponse(c, CREATED, LOGIN_DONE, response);
        } catch (error: any) {
            console.error("Error at sign in with email :", error);
            handleJsonParseError(error);
            console.error("Error at sign in with email :", error);
            throw error;
        }
    }

    signInWithPhoneHandlers = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validatedPhone = await validatedRequest<ValidatedSignInPhone>("signin-phone", reqBody, LOGIN_VALIDATION_CRITERIA);

            const loginUser = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["phone", "status"], ["=", "!="], [validatedPhone.phone, "ARCHIVED"]);
            if (!loginUser) throw new NotFoundException(USER_NOT_EXIST_WITH_PHONE);

            const otpData = prepareOTPData(loginUser, validatedPhone.phone, "SIGN_IN_WITH_OTP");
            await otpService.createOTP(otpData);
            await smsService.sendSms(validatedPhone.phone, otpData.otp, validatedPhone.signature_id);
            return sendResponse(c, CREATED, OTP_SENT);
        } catch (error: any) {
            console.error("Error at sign in with phone :", error);
            handleJsonParseError(error);
            console.error("Error at sign in with phone :", error);
            throw error;
        }
    }


    verifyOtpHandlers = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);

            const validReqData = await validatedRequest<ValidatedVerifyOtp>("verify-otp", reqBody, VERIFY_OTP_VALIDATION_CRITERIA);

            const user = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["phone", "status"], ["=", "!="], [validReqData.phone, "ARCHIVED"]);
            if (!user) throw new NotFoundException(USER_NOT_EXIST_WITH_PHONE);

            const otpData: NewOtp[] = await otpService.fetchOtp({ phone: validReqData.phone });
            const now = moment.utc();

            const otpValidationErrors: Record<string, string> = {};
            let otp = otpData[0];

            if (!otp || otp.otp !== validReqData.otp || !otp.expires_at || moment.utc(otp.expires_at).isBefore(now)) {
                otpValidationErrors.otp = INVALID_OTP;
            }

            if (Object.keys(otpValidationErrors).length > 0) {
                throw new UnprocessableEntityException(VERIFY_OTP_VALIDATION_CRITERIA, otpValidationErrors);
            }

            const validOtp = otp as Required<NewOtp>;
            const updatedUser = await otpService.verifyOtpAndUpdateUser(validOtp.id, user.id);

            const { access_token, refresh_token } = await genJWTTokensForUser(user.id);
            const { password, ...userDetails } = updatedUser;

            const data = { user_details: userDetails, access_token, refresh_token };

            if (validReqData.fcm_token) {
                const fcmToken = validReqData.fcm_token;
                const existingToken = await getSingleRecordByMultipleColumnValues<DeviceTokensTable>(deviceTokens, ["device_token", "user_id"], ["=", "="], [fcmToken, user.id]);

                if (!existingToken) {
                    const checkOtherDevice = await getSingleRecordByMultipleColumnValues<DeviceTokensTable>(deviceTokens, ["user_id"], ["="], [user.id]);
                    if (!checkOtherDevice || checkOtherDevice.device_token !== fcmToken) {
                        await saveSingleRecord<DeviceTokensTable>(deviceTokens, { device_token: fcmToken, user_id: user.id });
                    }
                }
            }
            return sendResponse(c, 200, USER_LOGIN, data);
        }
        catch (err: any) {
            console.error("Error at verify otp", err.message);
            handleJsonParseError(err);
            console.error("Error at verify otp", err.message);
            throw err;
        }
    };
}